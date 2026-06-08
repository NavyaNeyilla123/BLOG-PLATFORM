const BASE_URL = 'http://127.0.0.1:5000';

export const apiRequest = async (endpoint, options = {}) => {
    const token = localStorage.getItem('token');
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const config = { ...options, headers };
    const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const fullUrl = `${BASE_URL}/api${formattedEndpoint}`;
    
    try {
        const response = await fetch(fullUrl, config);
        const responseText = await response.text();
        
        let data = {};
        if (responseText) {
            data = JSON.parse(responseText);
        }

        if (!response.ok) {
            throw new Error(data.message || 'Server Request Failure');
        }
        return data;
    } catch (error) {
        console.error(`Error on ${endpoint}:`, error.message);
        alert(error.message);
        throw error;
    }
};