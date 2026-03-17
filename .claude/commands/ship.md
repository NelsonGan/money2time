Run the following two commands sequentially. If any command asks a yes/no question or asks for confirmation, answer Y (yes).

First, build:
```
eas env:exec production 'eas build --platform ios --profile production --local --output ./dist/Money2Time.ipa'
```

Wait for it to complete successfully, then submit:
```
yes | eas submit --platform ios --profile production --path ./dist/Money2Time.ipa
```
