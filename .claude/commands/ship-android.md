Run the following two commands sequentially. When prompted with a yes/no question, answer Y (yes).

First, build:

```
eas env:exec production 'eas build --platform android --profile production --local --output ./dist/Money2Time.aab --non-interactive'
```

Wait for it to complete successfully, then submit:

```
yes | eas submit --platform android --profile production --path ./dist/Money2Time.aab
```
