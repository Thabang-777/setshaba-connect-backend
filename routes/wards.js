import express from 'express';
import { supabase } from '../config/database.js';
import { authenticateToken, requireOfficial } from '../middleware/auth.js';
import { formatError, formatSuccess } from '../utils/helpers.js';

const router = express.Router();

// Get all wards (public endpoint with caching)
router.get('/', async (req, res) => {
  try {
    const { municipality_id, simplified = 'true' } = req.query;
    
    // Set cache headers for better performance
    res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    let query = supabase
      .from('wards')
      .select('id, ward_id, name, municipality_id, properties, created_at');
    
    // Only include geojson if not simplified
    if (simplified !== 'true') {
      query = query.select('*, geojson');
    }
    
    if (municipality_id) {
      query = query.eq('municipality_id', municipality_id);
    }
    
    query = query.order('name');

    const { data: wards, error } = await query;

    if (error) {
      return res.status(400).json(formatError('Failed to fetch wards'));
    }

    res.json(formatSuccess({ wards, count: wards.length }));

  } catch (error) {
    console.error('Get wards error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Get ward by ID
router.get('/:wardId', async (req, res) => {
  try {
    const { wardId } = req.params;
    const { include_geojson = 'false' } = req.query;
    
    let selectFields = 'id, ward_id, name, municipality_id, properties, created_at';
    if (include_geojson === 'true') {
      selectFields += ', geojson';
    }

    const { data: ward, error } = await supabase
      .from('wards')
      .select(selectFields)
      .eq('ward_id', wardId)
      .single();

    if (error) {
      return res.status(404).json(formatError('Ward not found'));
    }

    res.json(formatSuccess({ ward }));

  } catch (error) {
    console.error('Get ward error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Bulk import wards from GeoJSON (officials only)
router.post('/import', authenticateToken, requireOfficial, async (req, res) => {
  try {
    const { 
      geojson_url = 'https://raw.githubusercontent.com/Thabang-777/wards-geojson/main/wards.geojson', 
      municipality_id, 
      simplify_tolerance = 0.001,
      force_update = false 
    } = req.body;
    

    console.log(`Starting ward import from: ${geojson_url}`);

    // Fetch GeoJSON data
    const response = await fetch(geojson_url, {
      headers: {
        'User-Agent': 'Setshaba-Connect-Backend/1.0'
      }
    });
    
    if (!response.ok) {
      return res.status(400).json(formatError(`Failed to fetch GeoJSON data: ${response.statusText}`));
    }
    
    const geojsonData = await response.json();
    
    if (!geojsonData.features || !Array.isArray(geojsonData.features)) {
      return res.status(400).json(formatError('Invalid GeoJSON format'));
    }

    console.log(`Processing ${geojsonData.features.length} ward features`);

    const wardsToInsert = [];
    const processingErrors = [];
    
    for (const feature of geojsonData.features) {
      const properties = feature.properties || {};
      
      // Try multiple possible field names for ward ID
      const wardId = properties.WARD_ID || 
                    properties.ward_id || 
                    properties.id || 
                    properties.OBJECTID ||
                    properties.FID;
      
      // Try multiple possible field names for ward name
      const wardName = properties.WARD_NAME || 
                      properties.ward_name || 
                      properties.name || 
                      properties.NAME ||
                      `Ward ${wardId}`;
      
      // Try to get municipality info from properties
      const wardMunicipalityId = municipality_id || 
                                properties.municipality_id ||
                                properties.MUNICIPALITY_ID;
      
      if (!wardId) {
        processingErrors.push(`Skipping feature without ward ID: ${JSON.stringify(properties)}`);
        continue;
      }

      // Simplify geometry for better performance
      let simplifiedGeometry = feature.geometry;
      if (feature.geometry && feature.geometry.coordinates) {
        try {
          // Basic coordinate simplification for polygons
          if (feature.geometry.type === 'Polygon' && simplify_tolerance > 0) {
            const coords = feature.geometry.coordinates[0];
            if (coords && coords.length > 4) { // Only simplify if we have enough points
              const step = Math.max(1, Math.floor(coords.length * simplify_tolerance));
              const simplified = coords.filter((_, index) => index % step === 0);
              // Always keep the last point to close the polygon
              if (simplified[simplified.length - 1] !== coords[coords.length - 1]) {
                simplified.push(coords[coords.length - 1]);
              }
              simplifiedGeometry = {
                ...feature.geometry,
                coordinates: [simplified]
              };
            }
          } else if (feature.geometry.type === 'MultiPolygon' && simplify_tolerance > 0) {
            // Handle MultiPolygon simplification
            const simplifiedCoords = feature.geometry.coordinates.map(polygon => {
              const coords = polygon[0];
              if (coords && coords.length > 4) {
                const step = Math.max(1, Math.floor(coords.length * simplify_tolerance));
                const simplified = coords.filter((_, index) => index % step === 0);
                if (simplified[simplified.length - 1] !== coords[coords.length - 1]) {
                  simplified.push(coords[coords.length - 1]);
                }
                return [simplified];
              }
              return polygon;
            });
            simplifiedGeometry = {
              ...feature.geometry,
              coordinates: simplifiedCoords
            };
          }
        } catch (geomError) {
          console.warn(`Geometry simplification failed for ward ${wardId}:`, geomError);
          // Use original geometry if simplification fails
        }
      }

      wardsToInsert.push({
        ward_id: wardId.toString(),
        name: wardName,
        municipality_id: wardMunicipalityId || null,
        geojson: simplifiedGeometry,
        properties: {
          ...properties,
          import_timestamp: new Date().toISOString(),
          source_url: geojson_url
        }
      });
    }

    if (wardsToInsert.length === 0) {
      return res.status(400).json(formatError('No valid wards found in GeoJSON', 400, processingErrors));
    }

    console.log(`Prepared ${wardsToInsert.length} wards for insertion`);

    // Insert wards in batches for better performance
    const batchSize = 50; // Reduced for free tier
    let insertedCount = 0;
    let updatedCount = 0;
    const errors = [];
    
    for (let i = 0; i < wardsToInsert.length; i += batchSize) {
      const batch = wardsToInsert.slice(i, i + batchSize);
      
      try {
        const { data, error } = await supabase
          .from('wards')
          .upsert(batch, { 
            onConflict: 'ward_id',
            ignoreDuplicates: false 
          })
          .select('ward_id');

        if (error) {
          console.error(`Batch ${Math.floor(i/batchSize) + 1} insert error:`, error);
          errors.push(`Batch ${Math.floor(i/batchSize) + 1}: ${error.message}`);
          continue;
        }
      
        if (data) {
          insertedCount += data.length;
        }
        
        console.log(`Processed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(wardsToInsert.length/batchSize)}`);
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (batchError) {
        console.error(`Batch processing error:`, batchError);
        errors.push(`Batch ${Math.floor(i/batchSize) + 1}: ${batchError.message}`);
      }
    }

    // Refresh materialized view if it exists
    try {
      await supabase.rpc('refresh_materialized_view', { view_name: 'simplified_wards' });
    } catch (refreshError) {
      console.warn('Could not refresh materialized view:', refreshError);
    }

    const result = {
      source_url: geojson_url,
      total_features: geojsonData.features.length,
      processed_count: wardsToInsert.length,
      inserted_count: insertedCount,
      processing_errors: processingErrors.slice(0, 10), // Limit error details
      batch_errors: errors.slice(0, 5)
    };

    if (errors.length > 0) {
      res.status(207).json(formatSuccess(result, `Partially imported ${insertedCount} wards with ${errors.length} batch errors`));
    } else {
      res.json(formatSuccess(result, `Successfully imported ${insertedCount} wards`));
    }

  } catch (error) {
    console.error('Import wards error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Trigger ward import from live GeoJSON (officials only)
router.post('/import-live', authenticateToken, requireOfficial, async (req, res) => {
  try {
    const { municipality_id } = req.body;
    
    // Use the live GeoJSON URL
    const liveUrl = 'https://raw.githubusercontent.com/Thabang-777/wards-geojson/main/wards.geojson';
    
    // Forward to the main import endpoint
    const importResult = await fetch(`${req.protocol}://${req.get('host')}/api/wards/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization
      },
      body: JSON.stringify({
        geojson_url: liveUrl,
        municipality_id,
        simplify_tolerance: 0.002, // Slightly more aggressive simplification for live data
        force_update: true
      })
    });
    
    const result = await importResult.json();
    
    res.status(importResult.status).json({
      ...result,
      live_import: true,
      source: 'GitHub Live GeoJSON'
    });
    
  } catch (error) {
    console.error('Live import error:', error);
    res.status(500).json(formatError('Failed to import live ward data'));
  }
});

// Get simplified ward boundaries for map rendering
router.get('/boundaries/simplified', async (req, res) => {
  try {
    const { municipality_id, bounds, limit = 100 } = req.query;
    
    // Set aggressive caching for boundaries
    res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    let query = supabase
      .from('wards')
      .select('ward_id, name, geojson, properties')
      .limit(parseInt(limit));
    
    if (municipality_id) {
      query = query.eq('municipality_id', municipality_id);
    }
    
    query = query.order('name');
    
    const { data: wards, error } = await query;

    if (error) {
      return res.status(400).json(formatError('Failed to fetch ward boundaries'));
    }

    // Transform to GeoJSON FeatureCollection for map rendering
    const featureCollection = {
      type: 'FeatureCollection',
      metadata: {
        total_features: wards?.length || 0,
        municipality_id: municipality_id || 'all',
        generated_at: new Date().toISOString(),
        cache_duration: '1 hour'
      },
      features: wards.map(ward => ({
        type: 'Feature',
        properties: {
          ward_id: ward.ward_id,
          name: ward.name,
          ...ward.properties
        },
        geometry: ward.geojson
      })) || []
    };

    res.json(formatSuccess({ geojson: featureCollection }));

  } catch (error) {
    console.error('Get simplified boundaries error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Get ward statistics for analytics
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const { municipality_id } = req.query;
    
    let wardQuery = supabase
      .from('wards')
      .select('id, municipality_id');
    
    if (municipality_id) {
      wardQuery = wardQuery.eq('municipality_id', municipality_id);
    }
    
    const { data: wards } = await wardQuery;
    
    // Get report counts per ward
    let reportQuery = supabase
      .from('reports')
      .select('ward_id, category, status');
    
    if (municipality_id) {
      reportQuery = reportQuery.eq('municipality_id', municipality_id);
    }
    
    const { data: reports } = await reportQuery;
    
    // Process statistics
    const wardStats = {};
    
    reports?.forEach(report => {
      if (report.ward_id) {
        if (!wardStats[report.ward_id]) {
          wardStats[report.ward_id] = {
            total_reports: 0,
            by_category: {},
            by_status: {}
          };
        }
        wardStats[report.ward_id].total_reports++;
        wardStats[report.ward_id].by_category[report.category] = 
          (wardStats[report.ward_id].by_category[report.category] || 0) + 1;
        wardStats[report.ward_id].by_status[report.status] = 
          (wardStats[report.ward_id].by_status[report.status] || 0) + 1;
      }
    });
    
    res.set('Cache-Control', 'private, max-age=600'); // Cache for 10 minutes
    
    res.json(formatSuccess({
      total_wards: wards?.length || 0,
      municipality_id: municipality_id || 'all',
      ward_statistics: wardStats,
      summary: {
        wards_with_reports: Object.keys(wardStats).length,
        total_reports: reports?.length || 0
      }
    }));
    
  } catch (error) {
    console.error('Ward statistics error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

export default router;