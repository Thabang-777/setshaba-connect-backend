import express from 'express';
import { supabase } from '../config/database.js';
import { authenticateToken, requireOfficial } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import Joi from 'joi';
import { formatError, formatSuccess } from '../utils/helpers.js';

const router = express.Router();

// Validation schema for status updates
const createStatusUpdateSchema = Joi.object({
  update_text: Joi.string().min(5).max(1000).required()
});

// Add status update to a report (officials only)
router.post('/:reportId/status', authenticateToken, requireOfficial, validateRequest(createStatusUpdateSchema), async (req, res) => {
  try {
    const { reportId } = req.params;
    const { update_text } = req.body;
    const currentUser = req.user;

    // Verify report exists and official can access it
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('municipality_id')
      .eq('id', reportId)
      .single();

    if (reportError || !report) {
      return res.status(404).json(formatError('Report not found'));
    }

    if (report.municipality_id !== currentUser.municipality_id) {
      return res.status(403).json(formatError('Access denied'));
    }

    // Create status update
    const { data: statusUpdate, error } = await supabase
      .from('status_updates')
      .insert({
        report_id: reportId,
        update_text,
        created_by: currentUser.id
      })
      .select(`
        *,
        created_by_user:created_by (
          id,
          name,
          email
        )
      `)
      .single();

    if (error) {
      console.error('Create status update error:', error);
      return res.status(400).json(formatError('Failed to create status update'));
    }

    res.status(201).json(formatSuccess({ status_update: statusUpdate }, 'Status update created successfully'));

  } catch (error) {
    console.error('Create status update error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Get status updates for a report
router.get('/:reportId/status', async (req, res) => {
  try {
    const { reportId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Verify report exists
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('id')
      .eq('id', reportId)
      .single();

    if (reportError || !report) {
      return res.status(404).json(formatError('Report not found'));
    }

    const { data: statusUpdates, error, count } = await supabase
      .from('status_updates')
      .select(`
        *,
        created_by_user:created_by (
          id,
          name,
          email
        )
      `, { count: 'exact' })
      .eq('report_id', reportId)
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) {
      return res.status(400).json(formatError('Failed to fetch status updates'));
    }

    res.json(formatSuccess({ 
      status_updates: statusUpdates, 
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    }));

  } catch (error) {
    console.error('Get status updates error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

export default router;