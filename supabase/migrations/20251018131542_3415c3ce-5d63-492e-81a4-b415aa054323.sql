-- Drop the reconyx_photos table
DROP TABLE IF EXISTS public.reconyx_photos;

-- Delete the reconyx-photos storage bucket
DELETE FROM storage.buckets WHERE id = 'reconyx-photos';

-- Drop any objects in the reconyx-photos bucket
DELETE FROM storage.objects WHERE bucket_id = 'reconyx-photos';