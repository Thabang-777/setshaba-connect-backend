import { supabase } from '../config/database.js';

// Helper function to determine municipality based on coordinates
export const getMunicipalityFromCoordinates = async (lat, lng) => {
  try {
    // For now, return a default municipality
    // In a real implementation, you'd use a geocoding service or spatial queries
    const { data, error } = await supabase
      .from('municipalities')
      .select('id')
      .limit(1)
      .single();

    if (error || !data) {
      // Fallback to first municipality
      const { data: fallback } = await supabase
        .from('municipalities')
        .select('id')
        .limit(1)
        .single();
      
      return fallback?.id;
    }

    return data.id;
  } catch (error) {
    console.error('Error determining municipality:', error);
    return null;
  }
};

// Helper function to calculate distance between two points (Haversine formula)
export const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371; // Radius of Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in kilometers
};

// Helper function to format error responses
export const formatError = (message, statusCode = 400, details = null) => {
  return {
    error: message,
    statusCode,
    details,
    timestamp: new Date().toISOString()
  };
};

// Helper function to format success responses
export const formatSuccess = (data, message = 'Success') => {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  };
};