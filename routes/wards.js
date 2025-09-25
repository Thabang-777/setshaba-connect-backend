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
    const { geojson_url, municipality_id, simplify_tolerance = 0.001 } = req.body;
    
    if (!geojson_url) {
      return res.status(400).json(formatError('GeoJSON URL is required'));
    }

    // Fetch GeoJSON data
    const response = await fetch(geojson_url);
    if (!response.ok) {
      return res.status(400).json(formatError('Failed to fetch GeoJSON data'));
    }
    
    const geojsonData = await response.json();
    
    if (!geojsonData.features || !Array.isArray(geojsonData.features)) {
      return res.status(400).json(formatError('Invalid GeoJSON format'));
    }

    const wardsToInsert = [];
    
    for (const feature of geojsonData.features) {
      const properties = feature.properties || {};
      const wardId = properties.id || properties.WARD_ID || properties.ward_id;
      const wardName = properties.name || properties.WARD_NAME || `Ward ${wardId}`;
      
      if (!wardId) {
        console.warn('Skipping feature without ward ID:', properties);
        continue;
      }

      // Simplify geometry for better performance
      let simplifiedGeometry = feature.geometry;
      if (feature.geometry && feature.geometry.coordinates) {
        // Basic coordinate simplification - remove every nth point for polygons
        if (feature.geometry.type === 'Polygon' && simplify_tolerance > 0) {
          const coords = feature.geometry.coordinates[0];
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
      }

      wardsToInsert.push({
        ward_id: wardId.toString(),
        name: wardName,
        municipality_id: municipality_id || null,
        geojson: simplifiedGeometry,
        properties: properties
      });
    }

    if (wardsToInsert.length === 0) {
      return res.status(400).json(formatError('No valid wards found in GeoJSON'));
    }

    // Insert wards in batches for better performance
    const batchSize = 100;
    let insertedCount = 0;
    
    for (let i = 0; i < wardsToInsert.length; i += batchSize) {
      const batch = wardsToInsert.slice(i, i + batchSize);
      
      const { data, error } = await supabase
        .from('wards')
        .upsert(batch, { 
          onConflict: 'ward_id',
          ignoreDuplicates: false 
        });

      if (error) {
        console.error('Batch insert error:', error);
        return res.status(400).json(formatError(`Failed to insert ward batch: ${error.message}`));
      }
      
      insertedCount += batch.length;
    }

    res.json(formatSuccess({ 
      imported_count: insertedCount,
      total_features: geojsonData.features.length 
    }, `Successfully imported ${insertedCount} wards`));

  } catch (error) {
    console.error('Import wards error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Get simplified ward boundaries for map rendering
router.get('/boundaries/simplified', async (req, res) => {
  try {
    const { municipality_id, bounds } = req.query;
    
    // Set aggressive caching for boundaries
    res.set('Cache-Control', 'public, max-age=7200'); // Cache for 2 hours
    
    let query = supabase
      .from('wards')
      .select('ward_id, name, geojson');
    
    if (municipality_id) {
      query = query.eq('municipality_id', municipality_id);
    }
    
    // If bounds provided, we could add spatial filtering here
    // For now, we'll return all and let the client filter
    
    const { data: wards, error } = await query;

    if (error) {
      return res.status(400).json(formatError('Failed to fetch ward boundaries'));
    }

    // Transform to GeoJSON FeatureCollection for map rendering
    const featureCollection = {
      type: 'FeatureCollection',
      features: wards.map(ward => ({
        type: 'Feature',
        properties: {
          ward_id: ward.ward_id,
          name: ward.name
        },
        geometry: ward.geojson
      }))
    };

    res.json(formatSuccess({ geojson: featureCollection }));

  } catch (error) {
    console.error('Get simplified boundaries error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

export default router;