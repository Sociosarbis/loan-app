export type OneDriveFile = {
  id: string;
  name: string;
  folder?: {};
  lastModifiedDateTime: string;
  webUrl?: string;
  "@microsoft.graph.downloadUrl"?: string;
  size: number;
};
