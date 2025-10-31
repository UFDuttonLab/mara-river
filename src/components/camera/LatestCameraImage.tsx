import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, AlertCircle } from 'lucide-react';
import { cameraSupabase } from '@/integrations/supabase/camera-client';
import type { ReconyvImage } from '@/integrations/supabase/camera-types';
import { format } from 'date-fns';

const CAMERA_SERIAL = 'HLPXLS04231032';
const STORAGE_BUCKET = 'reconyx-images';
// Note: Database stores timestamps in EAT (mislabeled as UTC)

export const LatestCameraImage = () => {
  const [imageData, setImageData] = useState<ReconyvImage | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper to format camera timestamp (stored as EAT but mislabeled as UTC)
  const formatCameraTime = (timestamp: string) => {
    // Remove 'Z' to treat as naive datetime, preventing timezone conversion
    const naive = timestamp.replace('Z', '');
    const date = new Date(naive);
    return format(date, 'PPpp');
  };

  const fetchLatestImage = async () => {
    setLoading(true);
    setError(null);

    try {
      // Query for latest image from specific camera
      const { data, error: queryError } = await cameraSupabase
        .from('reconyx_images')
        .select('*')
        .eq('camera_serial', CAMERA_SERIAL)
        .not('time_taken_timestamp', 'is', null)
        .order('time_taken_timestamp', { ascending: false })
        .limit(1)
        .single();

      if (queryError) throw queryError;
      if (!data) throw new Error('No images found for this camera');

      const imageData = data as ReconyvImage;
      setImageData(imageData);

      // Get signed URL for the image
      const { data: signedUrlData, error: urlError } = await cameraSupabase
        .storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(imageData.storage_path, 3600); // 1 hour expiry

      if (urlError) throw urlError;
      if (!signedUrlData?.signedUrl) throw new Error('Failed to generate image URL');

      setImageUrl(signedUrlData.signedUrl);
    } catch (err) {
      console.error('Error fetching camera image:', err);
      setError(err instanceof Error ? err.message : 'Failed to load image');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLatestImage();
  }, []);

  if (loading) {
    return (
      <Card className="w-full mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            <Skeleton className="h-6 w-48" />
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="w-full aspect-video rounded-lg" />
          <Skeleton className="h-4 w-64 mt-4" />
        </CardContent>
      </Card>
    );
  }

  if (error || !imageData || !imageUrl) {
    return (
      <Card className="w-full mb-6 border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Camera Image Unavailable
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            {error || 'Unable to load the latest camera image'}
          </p>
          <Button onClick={fetchLatestImage} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full mb-6">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            <span>Latest Camera Image</span>
          </div>
          <Button onClick={fetchLatestImage} variant="ghost" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardTitle>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Camera: {CAMERA_SERIAL}</p>
          <p>
            Captured: {formatCameraTime(imageData.time_taken_timestamp)} EAT
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative w-full overflow-hidden rounded-lg border bg-muted">
          <img
            src={imageUrl}
            alt={`Camera ${CAMERA_SERIAL} - ${formatCameraTime(imageData.time_taken_timestamp)} EAT`}
            className="w-full h-auto object-contain"
            loading="lazy"
          />
        </div>
      </CardContent>
    </Card>
  );
};
