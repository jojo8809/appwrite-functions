import { ServeAttemptData } from "@/components/ServeAttempt";
import { ClientData } from "@/components/ClientForm";

/**
 * Normalize serve data from any format to the standard ServeAttemptData format
 * This handles conversion between snake_case, camelCase, and Appwrite document formats
 */
export function normalizeServeData(serveData: any): ServeAttemptData | null {
  // If no ID is provided, generate a temporary ID or return null
  if (!serveData.id && !serveData.$id) {
    console.warn("Skipping serve data without an ID:", serveData);
    
    // For development, you could generate a temporary ID
    // serveData.id = `temp_${Math.random().toString(36).substring(2, 15)}`;
    
    // Return null for now
    return null;
  }

  // Normalize ID
  const id = serveData.id || serveData.$id;

  // Normalize client ID
  const clientId = serveData.clientId || serveData.client_id;

  // Normalize timestamp
  let timestamp = null;
  if (serveData.timestamp) {
    if (typeof serveData.timestamp === 'string') {
      timestamp = new Date(serveData.timestamp);
    } else if (serveData.timestamp instanceof Date) {
      timestamp = serveData.timestamp;
    } else if (typeof serveData.timestamp === 'object' && serveData.timestamp) {
      // Handle Appwrite date format
      const ts = serveData.timestamp as any;
      if (ts.$date) {
        timestamp = new Date(ts.$date);
      } else if (ts.iso) {
        timestamp = new Date(ts.iso);
      } else if (ts.value) {
        timestamp = new Date(ts.value);
      }
    }
  }

  // Ensure timestamp is set
  if (!timestamp) {
    timestamp = new Date();
  }

  // Create the normalized object
  const normalizedData: ServeAttemptData = {
    id,
    clientId,
    timestamp,
    clientName: serveData.clientName || serveData.client_name || "",
    clientEmail: serveData.clientEmail || serveData.client_email || "",
    caseNumber: serveData.caseNumber || serveData.case_number || "",
    address: serveData.address || "",
    notes: serveData.notes || "",
    status: serveData.status || "pending",
    coordinates: serveData.coordinates || null,
    imageData: serveData.imageData || serveData.image_data || null,
    attemptNumber: serveData.attemptNumber || serveData.attempt_number || 1,
  };

  return normalizedData;
}

/**
 * Normalize an array of serve data objects
 */
export function normalizeServeDataArray(serves: any[]): ServeAttemptData[] {
  if (!Array.isArray(serves)) {
    console.warn("Expected array of serve data, got:", typeof serves);
    return [];
  }
  
  // Filter out null values after normalization
  return serves
    .map(serve => normalizeServeData(serve))
    .filter(serve => serve !== null) as ServeAttemptData[];
}

/**
 * Adds client names to serve attempts based on clientId
 */
export function addClientNamesToServes(serves: ServeAttemptData[], clients: ClientData[]): ServeAttemptData[] {
  if (!serves || !clients || !Array.isArray(serves) || !Array.isArray(clients)) {
    return serves || [];
  }

  return serves.map(serve => {
    // Skip if serve already has a client name
    if (serve.clientName && serve.clientName !== "Unknown Client") {
      return serve;
    }

    // Find matching client - check both id and $id properties
    const client = clients.find(c => {
      // Handle both ClientData and raw Appwrite document formats
      const clientId = c.id || (c as any).$id;
      return clientId === serve.clientId;
    });
    
    // Return updated serve with client name if found
    if (client) {
      return {
        ...serve,
        clientName: client.name
      };
    }
    
    return serve;
  });
}
