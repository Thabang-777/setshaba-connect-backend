import express from 'express';
import { supabaseAuth, supabase } from '../config/database.js';
import { validateRequest, registerSchema, loginSchema } from '../middleware/validation.js';
import { getMunicipalityFromCoordinates, formatError, formatSuccess } from '../utils/helpers.js';
import Joi from 'joi';

const router = express.Router();

// Register endpoint
router.post('/register', validateRequest(registerSchema), async (req, res) => {
  try {
    const { name, email, password, role, municipality_id, home_address, lat, lng } = req.body;

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAuth.auth.signUp({
      email,
      password,
    });

    if (authError) {
      return res.status(400).json(formatError(authError.message));
    }

    if (!authData.user) {
      return res.status(400).json(formatError('Failed to create user account'));
    }

    // Determine municipality_id for citizens based on coordinates
    let finalMunicipalityId = municipality_id;
    
    if (role === 'citizen' && lat && lng && !municipality_id) {
      finalMunicipalityId = await getMunicipalityFromCoordinates(lat, lng);
    }

    // Create user profile in our users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        name,
        email,
        role,
        municipality_id: finalMunicipalityId,
        home_address,
        lat,
        lng
      })
      .select()
      .single();

    if (userError) {
      console.error('User creation error:', userError);
      
      // Clean up auth user if profile creation failed
      await supabaseAuth.auth.admin.deleteUser(authData.user.id);
      
      return res.status(400).json(formatError('Failed to create user profile'));
    }

    // Return user data without sensitive information
    const { id, created_at, ...safeUserData } = userData;
    
    res.status(201).json(formatSuccess({
      user: { id, ...safeUserData, created_at }
    }, 'User registered successfully'));

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Login endpoint
router.post('/login', validateRequest(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Authenticate with Supabase
    const { data: authData, error: authError } = await supabaseAuth.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      return res.status(401).json(formatError('Invalid email or password'));
    }

    if (!authData.user || !authData.session) {
      return res.status(401).json(formatError('Login failed'));
    }

    // Get user profile
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (userError || !userData) {
      return res.status(404).json(formatError('User profile not found'));
    }

    res.json(formatSuccess({
      user: userData,
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_at: authData.session.expires_at
    }, 'Login successful'));

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Forgot password endpoint
router.post('/forgot-password', validateRequest(Joi.object({
  email: Joi.string().email().required()
})), async (req, res) => {
  try {
    const { email } = req.body;

    // Check if user exists in our database
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .single();

    // Always return success for security (don't reveal if email exists)
    // But only send reset email if user actually exists
    if (userData && !userError) {
      // Send password reset email using Supabase Auth
      const { error: resetError } = await supabaseAuth.auth.resetPasswordForEmail(email, {
        redirectTo: process.env.NODE_ENV === 'production' 
          ? 'https://setshaba-connect-backend.onrender.com/reset-password'
          : 'http://localhost:3000/reset-password'
      });

      if (resetError) {
        console.error('Password reset error:', resetError);
        // Still return success to not reveal if email exists
      }
    }

    res.json(formatSuccess(
      null, 
      'If an account with this email exists, you will receive a password reset link shortly.'
    ));

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Reset password endpoint
router.post('/reset-password', validateRequest(Joi.object({
  access_token: Joi.string().required(),
  refresh_token: Joi.string().required(),
  new_password: Joi.string().min(6).required()
})), async (req, res) => {
  try {
    const { access_token, refresh_token, new_password } = req.body;

    // Set the session with the tokens from the reset link
    const { data: sessionData, error: sessionError } = await supabaseAuth.auth.setSession({
      access_token,
      refresh_token
    });

    if (sessionError || !sessionData.user) {
      return res.status(400).json(formatError('Invalid or expired reset link'));
    }

    // Update the user's password
    const { error: updateError } = await supabaseAuth.auth.updateUser({
      password: new_password
    });

    if (updateError) {
      return res.status(400).json(formatError('Failed to update password'));
    }

    res.json(formatSuccess(null, 'Password updated successfully'));

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

export default router;