import express from 'express';
import { supabase } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import Joi from 'joi';
import { formatError, formatSuccess } from '../utils/helpers.js';

const router = express.Router();

// Validation schema for profile updates
const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  home_address: Joi.string().max(500).optional(),
  lat: Joi.number().min(-90).max(90).optional(),
  lng: Joi.number().min(-180).max(180).optional(),
  municipality_id: Joi.string().uuid().optional()
});

// Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const { data: userData, error } = await supabase
      .from('users')
      .select(`
        id,
        name,
        email,
        role,
        municipality_id,
        home_address,
        lat,
        lng,
        created_at,
        municipalities:municipality_id (
          id,
          name,
          province
        )
      `)
      .eq('id', req.user.id)
      .single();

    if (error) {
      return res.status(404).json(formatError('User not found'));
    }

    res.json(formatSuccess({ user: userData }));

  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Update current user profile
router.put('/me', authenticateToken, validateRequest(updateProfileSchema), async (req, res) => {
  try {
    const updates = req.body;
    const userId = req.user.id;

    // Remove any undefined values
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );

    if (Object.keys(cleanUpdates).length === 0) {
      return res.status(400).json(formatError('No valid fields to update'));
    }

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(cleanUpdates)
      .eq('id', userId)
      .select(`
        id,
        name,
        email,
        role,
        municipality_id,
        home_address,
        lat,
        lng,
        created_at,
        municipalities:municipality_id (
          id,
          name,
          province
        )
      `)
      .single();

    if (error) {
      console.error('Update user error:', error);
      return res.status(400).json(formatError('Failed to update profile'));
    }

    res.json(formatSuccess({ user: updatedUser }, 'Profile updated successfully'));

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Get user by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;

    // Users can only access their own data, or officials can access users in their municipality
    let query = supabase
      .from('users')
      .select(`
        id,
        name,
        email,
        role,
        municipality_id,
        home_address,
        lat,
        lng,
        created_at,
        municipalities:municipality_id (
          id,
          name,
          province
        )
      `)
      .eq('id', id);

    const { data: userData, error } = await query.single();

    if (error) {
      return res.status(404).json(formatError('User not found'));
    }

    // Check access permissions
    const canAccess = 
      currentUser.id === userData.id || // Own data
      (currentUser.role === 'official' && 
       currentUser.municipality_id === userData.municipality_id); // Same municipality official

    if (!canAccess) {
      return res.status(403).json(formatError('Access denied'));
    }

    res.json(formatSuccess({ user: userData }));

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

export default router;