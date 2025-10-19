// migration/updateLocations.js (run via Node script)
import { listingModel } from '../models/Listing.js'; // Adjust path as needed

export const migrateLocations = async () => {
  try {
    // Query ALL listings to check and fix comprehensively
    const allListings = await listingModel.find({});
    console.log(`Processing ${allListings.length} total listings.`);

    let migratedString = 0;
    let migratedMissingNull = 0;
    let migratedInvalidObject = 0;
    let skippedValid = 0;

    for (const listing of allListings) {
      let needsUpdate = false;
      let newLocation = null;

      if (!listing.location || typeof listing.location !== 'object' || !listing.location.county || listing.location.county.trim() === '') {
        // Case 1: Missing, null, undefined, or invalid object
        if (typeof listing.location === 'string' && listing.location.trim()) {
          // Valid string: Parse
          const parts = listing.location.split(', ');
          const county = parts[0].trim() 
          newLocation = {
            country: 'Kenya',
            county: county,
            constituency: '', // TODO: Optional future mapping
            fullAddress: '',
            coordinates: null,
          };
          migratedString++;
          needsUpdate = true;
        } else if (typeof listing.location === 'string' && !listing.location.trim()) {
          // Empty string: Treat as missing
          newLocation = {
            country: 'Kenya',
            county: listing.location,
            constituency: '',
            fullAddress: '',
            coordinates: null,
          };
          migratedMissingNull++;
          needsUpdate = true;
        } else {
          // Missing/null/invalid object: Default
          newLocation = {
            country: 'Kenya',
            county: listing.location,
            constituency: '',
            fullAddress: '',
            coordinates: null,
          };
          migratedMissingNull++;
          needsUpdate = true;
        }

        if (needsUpdate) {
          await listingModel.updateOne(
            { _id: listing._id },
            { $set: { location: newLocation } }
          );
          console.log(`Updated ${listing._id}: ${JSON.stringify(newLocation)}`);
        }
      } else {
        // Valid object: Skip
        skippedValid++;
      }
    }

    console.log(`Migration complete: ${migratedString} strings + ${migratedMissingNull} missing/null/invalids + ${skippedValid} already valid = total processed.`);
  } catch (error) {
    console.error('Migration failed:', error);
  }
};