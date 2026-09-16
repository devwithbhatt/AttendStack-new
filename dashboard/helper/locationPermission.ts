export type AttendanceLocationPayload = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
};

export const getGeolocationPermissionState = async (): Promise<PermissionState | "unsupported"> => {
  if (!navigator.permissions?.query) return "unsupported";

  try {
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return status.state;
  } catch {
    return "unsupported";
  }
};

export const getCurrentPosition = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });
};

export const isGeolocationPermissionDenied = (error: unknown) => (error as { code?: number })?.code === 1;

export const isGeolocationUnavailable = (error: unknown) => (error as { code?: number })?.code === 2;

export const toAttendanceLocationPayload = (position: GeolocationPosition): AttendanceLocationPayload => ({
  latitude: position.coords.latitude,
  longitude: position.coords.longitude,
  accuracy: position.coords.accuracy,
  timestamp: position.timestamp || Date.now(),
});
