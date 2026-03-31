// Helper module for fetching metrics from newsletter platforms (Beehiiv & ConvertKit)

export async function fetchBeehiivMetrics(
  apiKey: string
): Promise<{ subscribers: number; openRate: number; ctr: number } | null> {
  try {
    // 1. List publications to get the first publication ID
    const pubsRes = await fetch("https://api.beehiiv.com/v2/publications", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!pubsRes.ok) {
      console.error("Beehiiv publications request failed:", pubsRes.status);
      return null;
    }

    const pubsData = await pubsRes.json();
    const publications = pubsData?.data;

    if (!publications || publications.length === 0) {
      console.error("No Beehiiv publications found");
      return null;
    }

    const pubId = publications[0].id;

    // 2. Fetch publication stats
    const statsRes = await fetch(
      `https://api.beehiiv.com/v2/publications/${pubId}/stats`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    if (!statsRes.ok) {
      console.error("Beehiiv stats request failed:", statsRes.status);
      return null;
    }

    const statsData = await statsRes.json();
    const stats = statsData?.data;

    return {
      subscribers: stats?.total_subscribers ?? 0,
      openRate: stats?.average_open_rate ?? 0,
      ctr: stats?.average_click_rate ?? 0,
    };
  } catch (error) {
    console.error("Error fetching Beehiiv metrics:", error);
    return null;
  }
}

export async function fetchConvertKitMetrics(
  apiSecret: string
): Promise<{ subscribers: number } | null> {
  try {
    const res = await fetch(
      `https://api.convertkit.com/v3/subscribers?api_secret=${apiSecret}`
    );

    if (!res.ok) {
      console.error("ConvertKit subscribers request failed:", res.status);
      return null;
    }

    const data = await res.json();

    return {
      subscribers: data?.total_subscribers ?? 0,
    };
  } catch (error) {
    console.error("Error fetching ConvertKit metrics:", error);
    return null;
  }
}
