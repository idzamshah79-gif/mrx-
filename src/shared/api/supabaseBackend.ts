import { supabase, isSupabaseConfigured } from "./supabase";
import type {
  AuthTokens,
  AuthUser,
  PublicUser,
  UpdateProfileInput,
  ApiLikedTracksPage,
  ApiUserPlaylist,
  ApiUserPlaylistItem,
  ApiTrack,
} from "../contracts";
import { setAuthSession, clearAuthSession } from "./auth-session";

function mapSupabaseUserToAuthUser(user: any, profile?: any): PublicUser {
  return {
    id: user.id,
    email: user.email,
    username: profile?.username || user.user_metadata?.username || user.email?.split("@")[0] || "user",
    displayName: profile?.display_name || user.user_metadata?.display_name || user.email?.split("@")[0] || "User",
    avatarUrl: profile?.avatar_url || user.user_metadata?.avatar_url || null,
    isPublic: true,
  };
}

export const supabaseBackend = {
  isConfigured(): boolean {
    return isSupabaseConfigured() && supabase !== null;
  },

  async restoreSession(): Promise<AuthTokens | null> {
    if (!supabase) return null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.user) return null;

      let profile: any = null;
      try {
        const { data: prof } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .maybeSingle();
        profile = prof;
      } catch {}

      const authUser = mapSupabaseUserToAuthUser(session.user, profile);
      const tokens: AuthTokens = {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        accessTokenExpiresAt: session.expires_at
          ? new Date(session.expires_at * 1000).toISOString()
          : new Date(Date.now() + 3600000).toISOString(),
        user: authUser,
        expiresAt: session.expires_at ? session.expires_at * 1000 : Date.now() + 3600000,
      };
      setAuthSession(tokens);
      return tokens;
    } catch {
      return null;
    }
  },

  async login(email: string, password: string): Promise<AuthTokens> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.user || !data.session) throw new Error("Login failed, no session returned.");

    // Fetch profile
    let profile: any = null;
    try {
      const { data: profData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .maybeSingle();
      profile = profData;
    } catch {}

    const authUser = mapSupabaseUserToAuthUser(data.user, profile);
    const tokens: AuthTokens = {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      accessTokenExpiresAt: new Date(data.session.expires_at! * 1000).toISOString(),
      user: authUser,
      expiresAt: data.session.expires_at! * 1000,
    };

    setAuthSession(tokens);
    return tokens;
  },

  async register(
    email: string,
    password: string,
    username: string,
    displayName: string,
  ): Promise<AuthTokens> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const cleanUsername = username.trim().toLowerCase();
    const cleanDisplayName = displayName.trim() || cleanUsername;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: cleanUsername,
          display_name: cleanDisplayName,
        },
      },
    });
    if (error) throw error;
    if (!data.user) throw new Error("Registration failed.");

    // Ensure profile row exists
    try {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        username: cleanUsername,
        display_name: cleanDisplayName,
      }, { onConflict: "id" });
    } catch {}

    const authUser = mapSupabaseUserToAuthUser(data.user, {
      username: cleanUsername,
      display_name: cleanDisplayName,
    });

    const tokens: AuthTokens = {
      accessToken: data.session?.access_token || "sb_registered",
      refreshToken: data.session?.refresh_token || "",
      accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000 * 24).toISOString(),
      user: authUser,
    };

    setAuthSession(tokens);
    return tokens;
  },

  async getMe(): Promise<AuthUser> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw error || new Error("Not logged in");

    let profile: any = null;
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      profile = prof;
    } catch {}

    return mapSupabaseUserToAuthUser(user, profile);
  },

  async updateProfile(patch: UpdateProfileInput): Promise<PublicUser> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not logged in");

    const updatePayload: any = { updated_at: new Date().toISOString() };
    if (patch.displayName !== undefined) updatePayload.display_name = patch.displayName;
    if (patch.username !== undefined) updatePayload.username = patch.username.toLowerCase();
    if (patch.avatarUrl !== undefined) updatePayload.avatar_url = patch.avatarUrl;

    const { data, error } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", user.id)
      .select()
      .single();

    if (error) throw error;
    return mapSupabaseUserToAuthUser(user, data);
  },

  async logout(): Promise<void> {
    if (supabase) {
      await supabase.auth.signOut().catch(() => {});
    }
    await clearAuthSession();
  },

  // ---------------- LIKED TRACKS ----------------

  async getLikedTracks(limit = 50, _cursor?: string): Promise<ApiLikedTracksPage> {
    if (!supabase) return { items: [], nextCursor: null };
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { items: [], nextCursor: null };

    const { data, error } = await supabase
      .from("liked_songs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return { items: [], nextCursor: null };

    const items = data.map((row) => ({
      likedAt: row.created_at,
      track: {
        id: row.video_id,
        title: row.title,
        artists: [{ id: "", name: row.artist }],
        durationMs: Number(row.duration || 0) * 1000,
        cover: row.thumbnail
          ? {
              url: row.thumbnail,
              width: 500,
              height: 500,
            }
          : undefined,
        type: "track" as const,
        viewer: { liked: true },
      },
    }));

    return { items, nextCursor: null };
  },

  async likeTrack(id: string, snapshot?: any): Promise<void> {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const title = snapshot?.title || snapshot?.name || "Unknown Track";
    const artist = Array.isArray(snapshot?.artists)
      ? snapshot.artists.map((a: any) => a.name).join(", ")
      : typeof snapshot?.artist === "string"
        ? snapshot.artist
        : snapshot?.artist?.name || "Unknown Artist";
    const thumbnail = snapshot?.cover?.url || snapshot?.thumbnails?.[0]?.url || "";
    const duration = snapshot?.durationMs ? Math.round(snapshot.durationMs / 1000) : snapshot?.duration || 0;

    await supabase.from("liked_songs").upsert({
      user_id: user.id,
      video_id: id,
      title,
      artist,
      thumbnail,
      duration,
    }, { onConflict: "user_id,video_id" });
  },

  async unlikeTrack(id: string): Promise<void> {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("liked_songs")
      .delete()
      .eq("user_id", user.id)
      .eq("video_id", id);
  },

  // ---------------- PLAYLISTS ----------------

  async listPlaylists(): Promise<{ items: ApiUserPlaylist[] }> {
    if (!supabase) return { items: [] };
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { items: [] };

    const { data, error } = await supabase
      .from("playlists")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error || !data) return { items: [] };

    const items: ApiUserPlaylist[] = data.map((row) => ({
      id: row.id,
      title: row.name,
      description: row.description || "",
      isPublic: row.is_public || false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      revision: 1,
      ownerId: row.user_id,
    }));

    return { items };
  },

  async getUserPlaylist(id: string): Promise<{
    playlist: ApiUserPlaylist;
    items: ApiUserPlaylistItem[];
  }> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase
      .from("playlists")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) throw error || new Error("Playlist not found");

    const playlist: ApiUserPlaylist = {
      id: data.id,
      title: data.name,
      description: data.description || "",
      isPublic: data.is_public || false,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      revision: 1,
      ownerId: data.user_id,
    };

    const tracks: any[] = Array.isArray(data.tracks) ? data.tracks : [];
    const items: ApiUserPlaylistItem[] = tracks.map((t, idx) => ({
      id: `${data.id}-${t.id || t.videoId || idx}`,
      position: idx,
      addedAt: t.addedAt || data.created_at,
      track: {
        id: t.id || t.videoId || "",
        title: t.title || t.name || "",
        artists: Array.isArray(t.artists)
          ? t.artists
          : [{ id: "", name: typeof t.artist === "string" ? t.artist : t.artist?.name || "Unknown" }],
        durationMs: t.durationMs || (t.duration ? t.duration * 1000 : 0),
        cover: t.cover || (t.thumbnails?.[0]?.url ? { url: t.thumbnails[0].url, width: 500, height: 500 } : undefined),
        type: "track",
      },
    }));

    return { playlist, items };
  },

  async createPlaylist(input: {
    title: string;
    description?: string;
    isPublic?: boolean;
  }): Promise<ApiUserPlaylist> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not logged in");

    const { data, error } = await supabase
      .from("playlists")
      .insert({
        user_id: user.id,
        name: input.title,
        description: input.description || "",
        is_public: input.isPublic || false,
        tracks: [],
      })
      .select()
      .single();

    if (error || !data) throw error || new Error("Failed to create playlist");

    return {
      id: data.id,
      title: data.name,
      description: data.description || "",
      isPublic: data.is_public || false,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      revision: 1,
      ownerId: data.user_id,
    };
  },

  async updatePlaylist(
    id: string,
    input: { title?: string; description?: string | null; isPublic?: boolean },
  ): Promise<ApiUserPlaylist> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const payload: any = { updated_at: new Date().toISOString() };
    if (input.title !== undefined) payload.name = input.title;
    if (input.description !== undefined) payload.description = input.description;
    if (input.isPublic !== undefined) payload.is_public = input.isPublic;

    const { data, error } = await supabase
      .from("playlists")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error || !data) throw error || new Error("Failed to update playlist");

    return {
      id: data.id,
      title: data.name,
      description: data.description || "",
      isPublic: data.is_public || false,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      revision: 1,
      ownerId: data.user_id,
    };
  },

  async deletePlaylist(id: string): Promise<void> {
    if (!supabase) return;
    await supabase.from("playlists").delete().eq("id", id);
  },

  async addTrackToPlaylist(playlistId: string, track: any): Promise<void> {
    if (!supabase) return;
    const { data: pl } = await supabase
      .from("playlists")
      .select("tracks")
      .eq("id", playlistId)
      .single();

    if (!pl) return;
    const tracks: any[] = Array.isArray(pl.tracks) ? pl.tracks : [];
    tracks.push({ ...track, addedAt: new Date().toISOString() });

    await supabase
      .from("playlists")
      .update({ tracks, updated_at: new Date().toISOString() })
      .eq("id", playlistId);
  },

  async removeTrackFromPlaylist(playlistId: string, itemIdOrTrackId: string): Promise<void> {
    if (!supabase) return;
    const { data: pl } = await supabase
      .from("playlists")
      .select("tracks")
      .eq("id", playlistId)
      .single();

    if (!pl) return;
    const tracks: any[] = Array.isArray(pl.tracks) ? pl.tracks : [];
    const filtered = tracks.filter((t: any, idx: number) => {
      const matchId = t.id || t.videoId || String(idx);
      const composite = `${playlistId}-${matchId}`;
      return matchId !== itemIdOrTrackId && composite !== itemIdOrTrackId;
    });

    await supabase
      .from("playlists")
      .update({ tracks: filtered, updated_at: new Date().toISOString() })
      .eq("id", playlistId);
  },
};
