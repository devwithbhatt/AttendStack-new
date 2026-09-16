
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export const handleError = (error: any) => {
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    console.error('Error response:', error.response.data);
    toast.error(error.response.data.message || 'An error occurred');
  } else if (error.request) {
    // The request was made but no response was received
    console.error('Error request:', error.request);
    toast.error('No response from server');
  } else {
    // Something happened in setting up the request that triggered an Error
    console.error('Error message:', error.message);
    toast.error(error.message);
  }
};