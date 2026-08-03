# Money Manager 数据迁移到 Money2Time

Annotated screenshots for the "bring your Money Manager data across" tutorial.
Annotations are in Simplified Chinese. Each image is a 1290x2796 iPhone
screenshot with the target control spotlit and a numbered instruction card drawn
on top.

| File                                     | Step | Screen                                  |
| ---------------------------------------- | ---- | --------------------------------------- |
| `step-1-money-manager-backup.png`         | 1    | Money Manager, Settings, Backup          |
| `step-2-export-backup-file.png`           | 2    | Money Manager, Backup, export the file   |
| `step-3-save-to-files.png`                | 3    | iOS share sheet, Save to Files           |
| `step-4-money2time-data-management.png`   | 4    | Money2Time, Settings, Data Management    |
| `step-5-import-money-manager-backup.png`  | 5    | Money2Time, Import Money Manager Backup  |
| `step-6-choose-mmbak-file.png`            | 6    | Files picker, pick the `.mmbak` file     |

Type is Noto Sans SC; the accent is the app's rosewood `#B1525F`.

These are documentation/marketing assets. They are not referenced from app code
and `assets/tutorials/**` is deliberately absent from
`expo.updates.assetPatternsToBeBundled` in `app.json`, so they never ride along
in an EAS update payload.
