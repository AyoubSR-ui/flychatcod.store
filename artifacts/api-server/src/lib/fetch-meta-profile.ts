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
  // Meta OAuthException code 190 — the page access token itself is dead
  // (owner changed their Facebook password, token revoked, etc). No retry or
  // code fix can recover this; the store must reconnect the channel. Distinct
  // from a one-off fetch failure so callers can flag the connection broken
  // instead of silently failing on every message forever.
  tokenInvalid: boolean;
}

function emptyProfile(tokenInvalid = false): MetaProfile {
  return { name: null, firstName: null, lastName: null, username: null, profilePic: null, tokenInvalid };
}

export async function fetchMessengerProfile(psid: string, pageToken: string): Promise<MetaProfile> {
  try {
    const url = `https://graph.facebook.com/v18.0/${psid}?fields=name,first_name,last_name,profile_pic&access_token=${pageToken}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({})) as any;
    if (!res.ok || data.error) {
      console.warn(`[MetaProfile] Messenger fetch failed for ${psid}: ${res.status} — ${JSON.stringify(data.error || data)}`);
      return emptyProfile(data.error?.code === 190);
    }
    return {
      name: data.name || null,
      firstName: data.first_name || null,
      lastName: data.last_name || null,
      username: null,
      profilePic: data.profile_pic || null,
      tokenInvalid: false,
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
    const data = await res.json().catch(() => ({})) as any;
    if (!res.ok || data.error) {
      console.warn(`[MetaProfile] Instagram fetch failed for ${igsid}: ${res.status} — ${JSON.stringify(data.error || data)}`);
      return emptyProfile(data.error?.code === 190);
    }
    return {
      name: data.name || data.username || null,
      firstName: null,
      lastName: null,
      username: data.username || null,
      profilePic: data.profile_pic || null,
      tokenInvalid: false,
    };
  } catch (err) {
    console.error(`[MetaProfile] fetchInstagramProfile error:`, err);
    return emptyProfile();
  }
}
