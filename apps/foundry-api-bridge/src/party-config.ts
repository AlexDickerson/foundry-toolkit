/** Default Foundry folder name for player-character party members.
 *
 *  Change this one constant if the in-world folder is renamed.  Every
 *  party-member query uses it as its default; callers can still pass an
 *  explicit `folderName` to override it at call-time without touching
 *  this file.
 *
 *  NOTE: dm-tool's party-picker-utils.ts mirrors this value for UI
 *  display purposes — keep the two in sync when renaming. */
export const PARTY_FOLDER_NAME = 'The Party';
