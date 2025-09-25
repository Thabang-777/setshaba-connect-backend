import express from 'express';
import { supabase } from '../config/database.js';
import { authenticateToken, requireOfficial } from '../middleware/auth.js';
import { formatError, formatSuccess } from '../utils/helpers.js';

const router = express.Router();

// Get all municipalities (public endpoint)
router.get('/', async (req, res) => {
  try {
    const { include_geojson = 'false' } = req.query;
    
    let selectFields = 'id, name, province, created_at';
    if (include_geojson === 'true') {
      selectFields += ', bounds';
    }

    const { data: municipalities, error } = await supabase
      .from('municipalities')
      .select(selectFields)
      .order('name');

    if (error) {
      return res.status(400).json(formatError('Failed to fetch municipalities'));
    }

    res.json(formatSuccess({ municipalities }));

  } catch (error) {
    console.error('Get municipalities error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Get single municipality by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { include_reports = 'false', limit = 50, offset = 0 } = req.query;

    const { data: municipality, error } = await supabase
      .from('municipalities')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return res.status(404).json(formatError('Municipality not found'));
    }

    let result = { municipality };

    // Include reports if requested
    if (include_reports === 'true') {
      const { data: reports, error: reportsError, count } = await supabase
        .from('reports')
        .select(`
          *,
          created_by_user:created_by (
            id,
            name
          )
        `, { count: 'exact' })
        .eq('municipality_id', id)
        .order('created_at', { ascending: false })
        .range(offset, offset + parseInt(limit) - 1);

      if (reportsError) {
        return res.status(400).json(formatError('Failed to fetch municipality reports'));
      }

      result.reports = reports;
      result.reports_total = count;
      result.reports_limit = parseInt(limit);
      result.reports_offset = parseInt(offset);
    }

    res.json(formatSuccess(result));

  } catch (error) {
    console.error('Get municipality error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Get reports within municipality boundary (geospatial query)
router.get('/:id/reports', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, category, search, limit = 50, offset = 0 } = req.query;

    // Verify municipality exists
    const { data: municipality, error: municipalityError } = await supabase
      .from('municipalities')
      .select('id, bounds')
      .eq('id', id)
      .single();

    if (municipalityError || !municipality) {
      return res.status(404).json(formatError('Municipality not found'));
    }

    let query = supabase
      .from('reports')
      .select(`
        *,
        created_by_user:created_by (
          id,
          name
        )
      `, { count: 'exact' })
      .eq('municipality_id', id)
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (status) {
      query = query.eq('status', status);
    }

    if (category) {
      query = query.eq('category', category);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: reports, error, count } = await query;

    if (error) {
      return res.status(400).json(formatError('Failed to fetch reports'));
    }

    res.json(formatSuccess({ 
      reports, 
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset),
      municipality: {
        id: municipality.id,
        name: municipality.name
      }
    }));

  } catch (error) {
    console.error('Get municipality reports error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Bulk import municipalities (officials only)
router.post('/import', authenticateToken, requireOfficial, async (req, res) => {
  try {
    const { municipalities } = req.body;
    
    if (!municipalities || !Array.isArray(municipalities)) {
      return res.status(400).json(formatError('Municipalities array is required'));
    }

    const { data, error } = await supabase
      .from('municipalities')
      .upsert(municipalities, { 
        onConflict: 'name',
        ignoreDuplicates: false 
      })
      .select();

    if (error) {
      return res.status(400).json(formatError('Failed to import municipalities'));
    }

    res.json(formatSuccess({ 
      municipalities: data,
      imported_count: data.length 
    }, `Successfully imported ${data.length} municipalities`));

  } catch (error) {
    console.error('Import municipalities error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

export default router;