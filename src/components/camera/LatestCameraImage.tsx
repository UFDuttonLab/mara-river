import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { cameraSupabase } from '@/integrations/supabase/camera-client';
import type { ReconyvImage } from '@/integrations/supabase/camera-types';

const CAMERA_SERIAL = 'HLPXLS04231032';
const STORAGE_BUCKET = 'reconyx-images';
// Note: Database stores timestamps in EAT (mislabeled as UTC)

export const LatestCameraImage = () => {
  const [allImages, setAllImages] = useState<ReconyvImage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageData, setImageData] = useState<ReconyvImage | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper to format camera timestamp (stored as EAT but mislabeled as UTC)
  const formatCameraTime = (timestamp: string) => {
    // Extract datetime components directly from string without any Date object conversion
    // timestamp format: "2025-10-31T18:30:00+00:00" or "2025-10-31T18:30:00Z"
    const match = timestamp.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    
    if (!match) return timestamp; // Fallback if format unexpected
    
    const [, year, month, day, hour, minute] = match;
    
    // Format as readable date/time
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = monthNames[parseInt(month) - 1];
    
    return `${monthName} ${parseInt(day)}, ${year} at ${hour}:${minute}`;
  };

  const loadImageAtIndex = async (index: number, images?: ReconyvImage[]) => {
    const imageArray = images || allImages;
    const image = imageArray[index];
    if (!image) return;

    setLoading(true);
    setError(null);

    try {
      setImageData(image);

      // Get signed URL for the image
      const { data: signedUrlData, error: urlError } = await cameraSupabase
        .storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(image.storage_path, 3600); // 1 hour expiry

      if (urlError) throw urlError;
      if (!signedUrlData?.signedUrl) throw new Error('Failed to generate image URL');

      setImageUrl(signedUrlData.signedUrl);
    } catch (err) {
      console.error('Error loading camera image:', err);
      setError(err instanceof Error ? err.message : 'Failed to load image');
    } finally {
      setLoading(false);
    }
  };

  const fetchLatestImages = async () => {
    setLoading(true);
    setError(null);

    try {
      // Query for latest 50 images from specific camera
      const { data, error: queryError } = await cameraSupabase
        .from('reconyx_images')
        .select('*')
        .eq('camera_serial', CAMERA_SERIAL)
        .not('time_taken_timestamp', 'is', null)
        .order('time_taken_timestamp', { ascending: false })
        .limit(50);

      if (queryError) throw queryError;
      if (!data || data.length === 0) throw new Error('No images found for this camera');

      setAllImages(data);
      setCurrentIndex(0);
      await loadImageAtIndex(0, data);
    } catch (err) {
      console.error('Error fetching camera images:', err);
      setError(err instanceof Error ? err.message : 'Failed to load images');
      setLoading(false);
    }
  };

  const goToPreviousImage = async () => {
    if (currentIndex < allImages.length - 1) {
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      await loadImageAtIndex(newIndex);
    }
  };

  const goToNextImage = async () => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      setCurrentIndex(newIndex);
      await loadImageAtIndex(newIndex);
    }
  };

  useEffect(() => {
    fetchLatestImages();
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
          <Button onClick={fetchLatestImages} variant="outline" size="sm">
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
          <Button onClick={fetchLatestImages} variant="ghost" size="sm">
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
        
        {/* Navigation Controls */}
        <div className="flex items-center justify-between mt-4 gap-4">
          <Button
            onClick={goToPreviousImage}
            variant="outline"
            size="sm"
            disabled={currentIndex >= allImages.length - 1 || loading}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          
          <span className="text-sm text-muted-foreground">
            Image {currentIndex + 1} of {allImages.length}
          </span>
          
          <Button
            onClick={goToNextImage}
            variant="outline"
            size="sm"
            disabled={currentIndex === 0 || loading}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
