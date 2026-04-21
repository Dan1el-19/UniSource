import type { FileRecord, Folder } from '@unisource/sdk';

export type DriveFolderItem = {
  id: string;
  kind: 'folder';
  name: string;
  folder: Folder;
};

export type DriveFileItem = {
  id: string;
  kind: 'file';
  name: string;
  file: FileRecord;
};

export type DriveItem = DriveFolderItem | DriveFileItem;

export function isFolderItem(item: DriveItem): item is DriveFolderItem {
  return item.kind === 'folder';
}

export function isFileItem(item: DriveItem): item is DriveFileItem {
  return item.kind === 'file';
}
