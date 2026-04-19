-- Down migration for 0002_files_and_folders.sql
DROP INDEX IF EXISTS idx_files_user_folder_created;
DROP INDEX IF EXISTS idx_folders_user_parent_created;

DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS folders;
