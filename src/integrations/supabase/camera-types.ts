export type ReconyvImage = {
  id: string;
  camera_serial: string;
  time_taken_timestamp: string;
  storage_path: string;
  file_name: string;
  created_at: string;
  camera_name?: string;
  location?: string;
};

export type CameraDatabase = {
  public: {
    Tables: {
      reconyx_images: {
        Row: ReconyvImage;
        Insert: ReconyvImage;
        Update: Partial<ReconyvImage>;
      };
    };
  };
};
