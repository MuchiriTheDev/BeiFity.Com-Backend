// migration/fixMalformedLocations.js (run via Node script)
import mongoose from 'mongoose';
import { userModel } from '../models/User.js'; // Adjust path as needed

export const fixMalformedLocations = async () => {
  try {
    // Connect to MongoDB if not already connected (adjust connection string as needed)
    // await mongoose.connect('your-mongodb-uri');

    // Query ALL users to check and fix comprehensively
    const allUsers = await userModel.find({});
    console.log(`Processing ${allUsers.length} total users.`);

    let fixedMalformed = 0;
    let fixedOther = 0;
    let skippedValid = 0;

    for (const user of allUsers) {
      let needsUpdate = false;
      let updateObj = {};

      // Check and fix location if malformed
      if (user.personalInfo && user.personalInfo.location) {
        const loc = user.personalInfo.location;
        let locChanges = false;

        // Check if county is a malformed JSON string
        if (typeof loc.county === 'string' && loc.county.trim().startsWith('{')) {
          try {
            // Attempt to parse the stringified JSON
            const parsedCountyData = JSON.parse(loc.county);
            console.log(`Parsed malformed county for user ${user._id}:`, parsedCountyData);

            // Extract relevant fields (assuming 'city' in the string is the intended county)
            if (parsedCountyData.city) {
              loc.county = parsedCountyData.city.trim(); // e.g., 'Mombasa'
              locChanges = true;

              // Optionally merge other fields if present and useful
              if (parsedCountyData.fullAddress) {
                loc.fullAddress = parsedCountyData.fullAddress;
              }
              if (parsedCountyData.country) {
                loc.country = parsedCountyData.country; // Should already be 'Kenya'
              }
              // Coordinates might be duplicated; if needed, update loc.coordinates
              if (parsedCountyData.coordinates && parsedCountyData.coordinates.coordinates) {
                loc.coordinates = {
                  type: parsedCountyData.coordinates.type || 'Point',
                  coordinates: parsedCountyData.coordinates.coordinates
                };
              }
            }
            fixedMalformed++;
          } catch (parseError) {
            console.error(`Failed to parse county string for user ${user._id}:`, parseError, loc.county);
            // Fallback: Set to default if parse fails
            loc.county = 'Nyeri'; // Or 'Nairobi' etc.
            locChanges = true;
            fixedOther++;
          }
        }

        // Ensure constituency is set (if still missing after above)
        if (!loc.constituency || loc.constituency.trim() === '' || loc.constituency === 'Default Constituency') {
          // Use county-specific default if available; fallback to Nyeri
          const defaultConstituency = 'Nyeri Town'; // Default
          // You can expand this with constituenciesByCounty from previous scripts
          loc.constituency = defaultConstituency;
          locChanges = true;
          fixedOther++;
        }

        // Ensure other required fields are minimally set
        if (!loc.country || loc.country.trim() === '') {
          loc.country = 'Kenya';
          locChanges = true;
          fixedOther++;
        }
        if (!loc.fullAddress || loc.fullAddress.trim() === '') {
          loc.fullAddress = ''; // Or derive from county/constituency
          locChanges = true;
          fixedOther++;
        }
        // Ensure coordinates is a proper object
        if (!loc.coordinates || typeof loc.coordinates !== 'object') {
          loc.coordinates = {
            type: 'Point',
            coordinates: [36.8219, -1.2921] // Default Nairobi coords
          };
          locChanges = true;
          fixedOther++;
        }

        if (locChanges) {
          updateObj['personalInfo.location'] = loc;
          needsUpdate = true;
          console.log(`Fixed location for user ${user._id}:`, loc);
        }
      }

      // Apply update if needed
      if (needsUpdate) {
        await userModel.updateOne(
          { _id: user._id },
          { $set: updateObj }
        );
        console.log(`Updated user ${user._id} with location fixes`);
      } else {
        skippedValid++;
      }
    }

    console.log(`Fix complete: ${fixedMalformed} malformed counties + ${fixedOther} other location fixes + ${skippedValid} already valid = total processed.`);
  } catch (error) {
    console.error('Fix failed:', error);
  } finally {
    // mongoose.disconnect(); // Uncomment if you connected in this script
  }
};

// To run: node -r dotenv/config migration/fixMalformedLocations.js
