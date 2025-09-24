import express from 'express';
import { supabase } from '../config/database.js';
import { authenticateToken, requireCitizen, requireOfficial } from '../middleware/auth.js';
import { validateRequest, createReportSchema, updateReportSchema } from '../middleware/validation.js';
import { getMunicipalityFromCoordinates, formatError, formatSuccess } from '../utils/helpers.js';
import Joi from 'joi';

const router = express.Router();

// Additional validation schemas
const searchReportsSchema = Joi.object({
  municipality_id: Joi.string().uuid().optional(),
  status: Joi.string().valid('pending', 'acknowledged', 'in_progress', 'resolved').optional(),
  category: Joi.string().valid('water', 'electricity', 'roads', 'waste', 'safety', 'other').optional(),
  search: Joi.string().max(200).optional(),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0)
});

// Create a new report (citizens only)
router.post('/', authenticateToken, requireCitizen, validateRequest(createReportSchema), async (req, res) => {
  try {
    const { title, description, category, lat, lng, address, photo_url } = req.body;
    const userId = req.user.id;

    // Determine municipality from coordinates or user's municipality
    let municipalityId = req.user.municipality_id;
    
    if (!municipalityId) {
      municipalityId = await getMunicipalityFromCoordinates(lat, lng);
    }

    if (!municipalityId) {
      return res.status(400).json(formatError('Could not determine municipality for this location'));
    }

    const { data: report, error } = await supabase
      .from('reports')
      .insert({
        title,
        description,
        category,
        lat,
        lng,
        address,
        photo_url,
        municipality_id: municipalityId,
        created_by: userId
      })
      .select(`
        *,
        municipalities:municipality_id (
          id,
          name,
          province
        ),
        created_by_user:created_by (
          id,
          name,
          email
        )
      `)
      .single();

    if (error) {
      console.error('Create report error:', error);
      return res.status(400).json(formatError('Failed to create report'));
    }

    res.status(201).json(formatSuccess({ report }, 'Report created successfully'));

  } catch (error) {
    console.error('Create report error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Get all reports with filtering and search
router.get('/', async (req, res) => {
  try {
    const { error: validationError, value } = searchReportsSchema.validate(req.query);
    
    if (validationError) {
      return res.status(400).json(formatError('Invalid query parameters', 400, validationError.details));
    }

    const { municipality_id, status, category, search, limit, offset } = value;

    let query = supabase
      .from('reports')
      .select(`
        *,
        municipalities:municipality_id (
          id,
          name,
          province
        ),
        created_by_user:created_by (
          id,
          name
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (municipality_id) {
      query = query.eq('municipality_id', municipality_id);
    }

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

    res.json(formatSuccess({ reports, total: count, limit, offset }));

  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Get user's own reports (citizens only)
router.get('/mine', authenticateToken, requireCitizen, async (req, res) => {
  try {
    const userId = req.user.id;
    const { error: validationError, value } = searchReportsSchema.validate(req.query);
    
    if (validationError) {
      return res.status(400).json(formatError('Invalid query parameters', 400, validationError.details));
    }

    const { status, category, search, limit, offset } = value;

    let query = supabase
      .from('reports')
      .select(`
        *,
        municipalities:municipality_id (
          id,
          name,
          province
        )
      `, { count: 'exact' })
      .eq('created_by', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

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

    res.json(formatSuccess({ reports, total: count, limit, offset }));

  } catch (error) {
    console.error('Get user reports error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Get reports for municipality (officials only)
router.get('/municipality', authenticateToken, requireOfficial, async (req, res) => {
  try {
    const { error: validationError, value } = searchReportsSchema.validate(req.query);
    
    if (validationError) {
      return res.status(400).json(formatError('Invalid query parameters', 400, validationError.details));
    }

    const { municipality_id, status, category, search, limit, offset } = value;
    const userMunicipalityId = req.user.municipality_id;

    // Ensure official can only see reports from their municipality
    const targetMunicipalityId = municipality_id || userMunicipalityId;

    if (targetMunicipalityId !== userMunicipalityId) {
      return res.status(403).json(formatError('Access denied to reports from other municipalities'));
    }

    let query = supabase
      .from('reports')
      .select(`
        *,
        municipalities:municipality_id (
          id,
          name,
          province
        ),
        created_by_user:created_by (
          id,
          name,
          email
        ),
        assigned_official_user:assigned_official (
          id,
          name,
          email
        )
      `, { count: 'exact' })
      .eq('municipality_id', targetMunicipalityId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

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

    res.json(formatSuccess({ reports, total: count, limit, offset }));

  } catch (error) {
    console.error('Get municipality reports error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Get single report by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: report, error } = await supabase
      .from('reports')
      .select(`
        *,
        municipalities:municipality_id (
          id,
          name,
          province
        ),
        created_by_user:created_by (
          id,
          name,
          email
        ),
        assigned_official_user:assigned_official (
          id,
          name,
          email
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      return res.status(404).json(formatError('Report not found'));
    }

    // Get upvote count and user's upvote status
    const { data: upvoteData } = await supabase
      .from('report_upvotes')
      .select('user_id')
      .eq('report_id', id);

    const upvoteCount = upvoteData?.length || 0;
    const userUpvoted = req.user ? upvoteData?.some(upvote => upvote.user_id === req.user.id) : false;

    // Get latest status update
    const { data: latestStatus } = await supabase
      .from('status_updates')
      .select('*')
      .eq('report_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      return res.status(404).json(formatError('Report not found'));
    }

    res.json(formatSuccess({ 
      report: {
        ...report,
        upvote_count: upvoteCount,
        user_upvoted: userUpvoted,
        latest_status: latestStatus
      }
    }));

  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Update report (owner only)
router.put('/:id', authenticateToken, validateRequest(updateReportSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const currentUser = req.user;

    // Verify user owns this report
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('created_by, municipality_id')
      .eq('id', id)
      .single();

    if (reportError || !report) {
      return res.status(404).json(formatError('Report not found'));
    }

    // Only report owner or officials from same municipality can update
    const canUpdate = 
      report.created_by === currentUser.id ||
      (currentUser.role === 'official' && report.municipality_id === currentUser.municipality_id);

    if (!canUpdate) {
      return res.status(403).json(formatError('Access denied'));
    }

    // Citizens can only update certain fields
    if (currentUser.role === 'citizen' && report.created_by === currentUser.id) {
      const allowedFields = ['title', 'description', 'category', 'photo_url'];
      const filteredUpdates = Object.fromEntries(
        Object.entries(updates).filter(([key]) => allowedFields.includes(key))
      );
      updates = filteredUpdates;
    }

    const { data: updatedReport, error } = await supabase
      .from('reports')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        municipalities:municipality_id (
          id,
          name,
          province
        ),
        created_by_user:created_by (
          id,
          name,
          email
        ),
        assigned_official_user:assigned_official (
          id,
          name,
          email
        )
      `)
      .single();

    if (error) {
      return res.status(400).json(formatError('Failed to update report'));
    }

    res.json(formatSuccess({ report: updatedReport }, 'Report updated successfully'));

  } catch (error) {
    console.error('Update report error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Delete report (owner only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;

    // Verify user owns this report or is admin
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('created_by')
      .eq('id', id)
      .single();

    if (reportError || !report) {
      return res.status(404).json(formatError('Report not found'));
    }

    if (report.created_by !== currentUser.id) {
      return res.status(403).json(formatError('Access denied'));
    }

    const { error } = await supabase
      .from('reports')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json(formatError('Failed to delete report'));
    }

    res.json(formatSuccess(null, 'Report deleted successfully'));

  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Upvote a report (citizens only)
router.post('/:id/upvote', authenticateToken, requireCitizen, async (req, res) => {
  try {
    const { id: reportId } = req.params;
    const userId = req.user.id;

    // Check if report exists
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('id, created_by')
      .eq('id', reportId)
      .single();

    if (reportError || !report) {
      return res.status(404).json(formatError('Report not found'));
    }

    // Users cannot upvote their own reports
    if (report.created_by === userId) {
      return res.status(400).json(formatError('Cannot upvote your own report'));
    }

    // Check if user already upvoted
    const { data: existingUpvote } = await supabase
      .from('report_upvotes')
      .select('id')
      .eq('report_id', reportId)
      .eq('user_id', userId)
      .single();

    if (existingUpvote) {
      // Remove upvote
      const { error: deleteError } = await supabase
        .from('report_upvotes')
        .delete()
        .eq('report_id', reportId)
        .eq('user_id', userId);

      if (deleteError) {
        return res.status(400).json(formatError('Failed to remove upvote'));
      }

      res.json(formatSuccess({ upvoted: false }, 'Upvote removed'));
    } else {
      // Add upvote
      const { error: insertError } = await supabase
        .from('report_upvotes')
        .insert({
          report_id: reportId,
          user_id: userId
        });

      if (insertError) {
        return res.status(400).json(formatError('Failed to add upvote'));
      }

      res.json(formatSuccess({ upvoted: true }, 'Report upvoted'));
    }

  } catch (error) {
    console.error('Upvote error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Remove upvote from a report (citizens only)
router.delete('/:id/upvote', authenticateToken, requireCitizen, async (req, res) => {
  try {
    const { id: reportId } = req.params;
    const userId = req.user.id;

    // Check if report exists
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('id, created_by')
      .eq('id', reportId)
      .single();

    if (reportError || !report) {
      return res.status(404).json(formatError('Report not found'));
    }

    // Users cannot remove upvote from their own reports
    if (report.created_by === userId) {
      return res.status(400).json(formatError('Cannot remove upvote from your own report'));
    }

    // Check if user has upvoted
    const { data: existingUpvote } = await supabase
      .from('report_upvotes')
      .select('id')
      .eq('report_id', reportId)
      .eq('user_id', userId)
      .single();

    if (!existingUpvote) {
      return res.status(400).json(formatError('You have not upvoted this report'));
    }

    // Remove upvote
    const { error: deleteError } = await supabase
      .from('report_upvotes')
      .delete()
      .eq('report_id', reportId)
      .eq('user_id', userId);

    if (deleteError) {
      return res.status(400).json(formatError('Failed to remove upvote'));
    }

    res.json(formatSuccess({ upvoted: false }, 'Upvote removed successfully'));

  } catch (error) {
    console.error('Remove upvote error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

export default router;