export function useIsMobile() {
  // Always return false — sidebar should never collapse into a mobile sheet.
  // Lectio is a desktop app; hiding the sidebar leaves users with no navigation.
  return false
}
