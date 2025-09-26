import express from 'express';
import { supabase } from '../config/database.js';
import { authenticateToken, requireOfficial } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import Joi from 'joi';
import { formatError, formatSuccess } from '../utils/helpers.js';

const router = express.Router();

// Validation schema for status updates
const createStatusUpdateSchema = Joi.object({
  update_text: Joi.string().min(5).max(1000).required(),
  new_status: Joi.string().valid('pending', 'acknowledged', 'in_progress', 'resolved').optional(),
  internal_notes: Joi.string().max(500).optional()
});

// Add status update to a report (officials only)
router.post('/:reportId/status', authenticateToken, requireOfficial, validateRequest(createStatusUpdateSchema), async (req, res) => {
  try {
    const { reportId } = req.params;
    const { update_text, new_status, internal_notes } = req.body;
    const currentUser = req.user;

    // Verify report exists and official can access it
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('municipality_id, status, assigned_official')
      .eq('id', reportId)
      .single();

    if (reportError || !report) {
      return res.status(404).json(formatError('Report not found'));
    }

    if (report.municipality_id !== currentUser.municipality_id) {
      return res.status(403).json(formatError('Access denied'));
    }

    // Start a transaction to update both status_updates and reports table
    const updates = [];

    // Create status update
    const { data: statusUpdate, error: statusError } = await supabase
      .from('status_updates')
      .insert({
        report_id: reportId,
        update_text,
        created_by: currentUser.id,
        internal_notes,
        previous_status: report.status,
        new_status: new_status || report.status
      })
      .select(`
        *,
        official:created_by (
          id,
          name,
          email,
          role
        )
      `)
      .single();

    if (statusError) {
      console.error('Create status update error:', statusError);
      return res.status(400).json(formatError('Failed to create status update'));
    }

    // Update report status and assignment if provided
    if (new_status && new_status !== report.status) {
      const reportUpdates = {
        status: new_status,
        assigned_official: currentUser.id, // Assign to the official making the update
        updated_at: new Date().toISOString()
      };

      const { error: reportUpdateError } = await supabase
        .from('reports')
        .update(reportUpdates)
        .eq('id', reportId);

      if (reportUpdateError) {
        console.error('Report status update error:', reportUpdateError);
        return res.status(400).json(formatError('Failed to update report status'));
      }
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
        official:created_by (
          id,
          name,
          email,
          role
        )
      `, { count: 'exact' })
      .eq('report_id', reportId)
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) {
      return res.status(400).json(formatError('Failed to fetch status updates'));
    }

    res.set('Cache-Control', 'private, max-age=60'); // Cache for 1 minute

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

// Get status update history for accountability
router.get('/:reportId/history', authenticateToken, async (req, res) => {
  try {
    const { reportId } = req.params;

    // Get comprehensive history including all updates and assignments
    const { data: history } = await supabase
      .from('status_updates')
      .select(`
        *,
        official:created_by (
          id,
          name,
          email,
          role
        )
      `)
      .eq('report_id', reportId)
      .order('created_at', { ascending: true });

    if (!history) {
      return res.status(404).json(formatError('No history found for this report'));
    }

    // Transform history for accountability view
    const accountabilityHistory = history.map(update => ({
      timestamp: update.created_at,
      action: update.new_status !== update.previous_status ? 'status_change' : 'update',
      official: {
        id: update.official?.id,
        name: update.official?.name,
        role: update.official?.role
      },
      details: {
        message: update.update_text,
        previous_status: update.previous_status,
        new_status: update.new_status,
        internal_notes: update.internal_notes
      }
    }));

    res.set('Cache-Control', 'private, max-age=300'); // Cache for 5 minutes

    res.json(formatSuccess({
      report_id: reportId,
      history: accountabilityHistory,
      total_updates: history.length
    }));

  } catch (error) {
    console.error('Get status history error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

export default router;