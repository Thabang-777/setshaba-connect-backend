import express from 'express';
import { supabase } from '../config/database.js';
import { authenticateToken, requireOfficial } from '../middleware/auth.js';
import { formatError, formatSuccess } from '../utils/helpers.js';

const router = express.Router();

// Get comprehensive analytics dashboard data
router.get('/dashboard', authenticateToken, requireOfficial, async (req, res) => {
  try {
    const { municipality_id, days = 30 } = req.query;
    const userMunicipalityId = req.user.municipality_id;
    
    // Ensure official can only see analytics from their municipality
    const targetMunicipalityId = municipality_id || userMunicipalityId;
    
    if (targetMunicipalityId !== userMunicipalityId) {
      return res.status(403).json(formatError('Access denied to analytics from other municipalities'));
    }

    const dateFilter = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Get reports by category
    const { data: categoryStats } = await supabase
      .from('reports')
      .select('category')
      .eq('municipality_id', targetMunicipalityId)
      .gte('created_at', dateFilter);

    // Get reports by status
    const { data: statusStats } = await supabase
      .from('reports')
      .select('status')
      .eq('municipality_id', targetMunicipalityId);

    // Get trending areas (wards with most reports)
    const { data: wardStats } = await supabase
      .from('reports')
      .select(`
        ward_id,
        wards:ward_id (name)
      `)
      .eq('municipality_id', targetMunicipalityId)
      .gte('created_at', dateFilter)
      .not('ward_id', 'is', null);

    // Get resolution time analytics
    const { data: resolutionStats } = await supabase
      .from('reports')
      .select('created_at, status')
      .eq('municipality_id', targetMunicipalityId)
      .eq('status', 'resolved')
      .gte('created_at', dateFilter);

    // Get most active officials
    const { data: officialStats } = await supabase
      .from('status_updates')
      .select(`
        created_by,
        users:created_by (name, role)
      `)
      .gte('created_at', dateFilter);

    // Process category statistics
    const categoryBreakdown = categoryStats?.reduce((acc, report) => {
      acc[report.category] = (acc[report.category] || 0) + 1;
      return acc;
    }, {}) || {};

    // Process status statistics
    const statusBreakdown = statusStats?.reduce((acc, report) => {
      acc[report.status] = (acc[report.status] || 0) + 1;
      return acc;
    }, {}) || {};

    // Process ward statistics
    const wardBreakdown = wardStats?.reduce((acc, report) => {
      if (report.ward_id && report.wards?.name) {
        const key = `${report.wards.name} (${report.ward_id})`;
        acc[key] = (acc[key] || 0) + 1;
      }
      return acc;
    }, {}) || {};

    // Calculate average resolution time
    const avgResolutionTime = resolutionStats?.length > 0 
      ? resolutionStats.reduce((sum, report) => {
          const days = Math.floor((new Date() - new Date(report.created_at)) / (1000 * 60 * 60 * 24));
          return sum + days;
        }, 0) / resolutionStats.length
      : 0;

    // Process official activity
    const officialActivity = officialStats?.reduce((acc, update) => {
      if (update.users?.name) {
        acc[update.users.name] = (acc[update.users.name] || 0) + 1;
      }
      return acc;
    }, {}) || {};

    res.set('Cache-Control', 'private, max-age=300'); // Cache for 5 minutes

    res.json(formatSuccess({
      period_days: parseInt(days),
      municipality_id: targetMunicipalityId,
      summary: {
        total_reports: statusStats?.length || 0,
        pending_reports: statusBreakdown.pending || 0,
        resolved_reports: statusBreakdown.resolved || 0,
        avg_resolution_days: Math.round(avgResolutionTime * 10) / 10
      },
      category_breakdown: categoryBreakdown,
      status_breakdown: statusBreakdown,
      trending_wards: Object.entries(wardBreakdown)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {}),
      official_activity: Object.entries(officialActivity)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {}),
      ai_insights: {
        most_reported_category: Object.entries(categoryBreakdown).sort(([,a], [,b]) => b - a)[0]?.[0] || null,
        hotspot_ward: Object.entries(wardBreakdown).sort(([,a], [,b]) => b - a)[0]?.[0] || null,
        resolution_trend: avgResolutionTime < 7 ? 'improving' : avgResolutionTime > 14 ? 'concerning' : 'stable'
      }
    }));

  } catch (error) {
    console.error('Analytics dashboard error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Get time-series data for charts
router.get('/timeseries', authenticateToken, requireOfficial, async (req, res) => {
  try {
    const { municipality_id, days = 30, granularity = 'daily' } = req.query;
    const userMunicipalityId = req.user.municipality_id;
    
    const targetMunicipalityId = municipality_id || userMunicipalityId;
    
    if (targetMunicipalityId !== userMunicipalityId) {
      return res.status(403).json(formatError('Access denied'));
    }

    const dateFilter = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Get reports with timestamps
    const { data: reports } = await supabase
      .from('reports')
      .select('created_at, category, status')
      .eq('municipality_id', targetMunicipalityId)
      .gte('created_at', dateFilter)
      .order('created_at');

    // Process time series data
    const timeSeries = {};
    const dateFormat = granularity === 'daily' ? 'YYYY-MM-DD' : 'YYYY-MM';

    reports?.forEach(report => {
      const date = new Date(report.created_at).toISOString().split('T')[0];
      if (!timeSeries[date]) {
        timeSeries[date] = { total: 0, by_category: {}, by_status: {} };
      }
      timeSeries[date].total++;
      timeSeries[date].by_category[report.category] = (timeSeries[date].by_category[report.category] || 0) + 1;
      timeSeries[date].by_status[report.status] = (timeSeries[date].by_status[report.status] || 0) + 1;
    });

    res.set('Cache-Control', 'private, max-age=600'); // Cache for 10 minutes

    res.json(formatSuccess({
      granularity,
      period_days: parseInt(days),
      data: timeSeries
    }));

  } catch (error) {
    console.error('Time series analytics error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

// Get AI-ready data export for machine learning
router.get('/ai-export', authenticateToken, requireOfficial, async (req, res) => {
  try {
    const { municipality_id, format = 'json' } = req.query;
    const userMunicipalityId = req.user.municipality_id;
    
    const targetMunicipalityId = municipality_id || userMunicipalityId;
    
    if (targetMunicipalityId !== userMunicipalityId) {
      return res.status(403).json(formatError('Access denied'));
    }

    // Get comprehensive report data for AI analysis
    const { data: reports } = await supabase
      .from('reports')
      .select(`
        id,
        title,
        description,
        category,
        status,
        lat,
        lng,
        upvotes,
        created_at,
        ward_id,
        wards:ward_id (name, properties)
      `)
      .eq('municipality_id', targetMunicipalityId)
      .order('created_at');

    // Transform data for AI consumption
    const aiReadyData = reports?.map(report => ({
      report_id: report.id,
      text_features: {
        title: report.title,
        description: report.description,
        title_length: report.title?.length || 0,
        description_length: report.description?.length || 0,
        word_count: (report.title + ' ' + report.description).split(' ').length
      },
      categorical_features: {
        category: report.category,
        status: report.status,
        ward_name: report.wards?.name || 'unknown'
      },
      numerical_features: {
        latitude: report.lat,
        longitude: report.lng,
        upvotes: report.upvotes || 0,
        days_since_created: Math.floor((new Date() - new Date(report.created_at)) / (1000 * 60 * 60 * 24))
      },
      temporal_features: {
        created_at: report.created_at,
        hour_of_day: new Date(report.created_at).getHours(),
        day_of_week: new Date(report.created_at).getDay(),
        month: new Date(report.created_at).getMonth() + 1
      },
      geospatial_features: {
        ward_properties: report.wards?.properties || {}
      }
    })) || [];

    res.set('Cache-Control', 'private, max-age=1800'); // Cache for 30 minutes

    res.json(formatSuccess({
      format,
      total_records: aiReadyData.length,
      municipality_id: targetMunicipalityId,
      export_timestamp: new Date().toISOString(),
      data: aiReadyData,
      metadata: {
        features: {
          text: ['title', 'description', 'title_length', 'description_length', 'word_count'],
          categorical: ['category', 'status', 'ward_name'],
          numerical: ['latitude', 'longitude', 'upvotes', 'days_since_created'],
          temporal: ['created_at', 'hour_of_day', 'day_of_week', 'month'],
          geospatial: ['ward_properties']
        },
        suggested_ml_tasks: [
          'report_classification',
          'priority_prediction',
          'resolution_time_estimation',
          'hotspot_detection',
          'sentiment_analysis'
        ]
      }
    }));

  } catch (error) {
    console.error('AI export error:', error);
    res.status(500).json(formatError('Internal server error'));
  }
});

export default router;