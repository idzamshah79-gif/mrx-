-- ==============================================================================
-- SKRIP SETUP PANGKALAN DATA SUPABASE UNTUK MUSIC APP & LINER DESKTOP
-- Jalankan skrip ini dalam Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. JADUAL PROFILES (Profil Pengguna)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Aktifkan Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profil boleh dilihat oleh sesiapa sahaja"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Pengguna hanya boleh mengemas kini profil sendiri"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Trigger automatik untuk mencipta rekod profil apabila pengguna mendaftar
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 2. JADUAL LIKED SONGS (Lagu Yang Disukai)
CREATE TABLE IF NOT EXISTS public.liked_songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  thumbnail TEXT,
  duration NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, video_id)
);

ALTER TABLE public.liked_songs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pengguna boleh melihat lagu disukai sendiri"
  ON public.liked_songs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Pengguna boleh menambah lagu disukai sendiri"
  ON public.liked_songs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Pengguna boleh memadam lagu disukai sendiri"
  ON public.liked_songs FOR DELETE
  USING (auth.uid() = user_id);


-- 3. JADUAL PLAYLISTS (Senarai Main)
CREATE TABLE IF NOT EXISTS public.playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  cover_url TEXT DEFAULT '',
  tracks JSONB DEFAULT '[]'::jsonb NOT NULL,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pengguna boleh melihat playlist sendiri dan playlist awam"
  ON public.playlists FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Pengguna boleh mencipta playlist sendiri"
  ON public.playlists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Pengguna boleh mengemas kini playlist sendiri"
  ON public.playlists FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Pengguna boleh memadam playlist sendiri"
  ON public.playlists FOR DELETE
  USING (auth.uid() = user_id);
