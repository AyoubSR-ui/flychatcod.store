// Fetches real customer name and profile pic from the Meta Graph API. Called
// when a Messenger/Instagram customer's name is still unknown (new customer,
// or an existing one still stuck on the generic placeholder) — the webhook
// payload itself never includes the sender's name, only their PSID/IGSID.

interface MetaProfile {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null; // Instagram only
  profilePic: string | null;
}

function emptyProfile(): MetaProfile {
  return { name: null, firstName: null, lastName: null, username: null, profilePic: null };
}

export async function fetchMessengerProfile(psid: string, pageToken: string): Promise<MetaProfile> {
  try {
    const url = `https://graph.facebook.com/v18.0/${psid}?fields=name,first_name,last_name,profile_pic&access_token=${pageToken}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[MetaProfile] Messenger fetch failed for ${psid}: ${res.status}`);
      return emptyProfile();
    }
    const data = await res.json() as any;
    if (data.error) {
      console.warn(`[MetaProfile] Messenger API error for ${psid}:`, data.error.message);
      return emptyProfile();
    }
    return {
      name: data.name || null,
      firstName: data.first_name || null,
      lastName: data.last_name || null,
      username: null,
      profilePic: data.profile_pic || null,
    };
  } catch (err) {
    console.error(`[MetaProfile] fetchMessengerProfile error:`, err);
    return emptyProfile();
  }
}

export async function fetchInstagramProfile(igsid: string, pageToken: string): Promise<MetaProfile> {
  try {
    const url = `https://graph.facebook.com/v18.0/${igsid}?fields=name,username,profile_pic&access_token=${pageToken}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[MetaProfile] Instagram fetch failed for ${igsid}: ${res.status}`);
      return emptyProfile();
    }
    const data = await res.json() as any;
    if (data.error) {
      console.warn(`[MetaProfile] Instagram API error for ${igsid}:`, data.error.message);
      return emptyProfile();
    }
    return {
      name: data.name || data.username || null,
      firstName: null,
      lastName: null,
      username: data.username || null,
      profilePic: data.profile_pic || null,
    };
  } catch (err) {
    console.error(`[MetaProfile] fetchInstagramProfile error:`, err);
    return emptyProfile();
  }
}
