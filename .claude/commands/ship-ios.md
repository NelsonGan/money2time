Run the following two commands sequentially. When prompted with a yes/no question, answer Y (yes). When prompted for an email, enter nelson.ganlw@gmail.com.

First, build:

```
eas env:exec production 'eas build --platform ios --profile production --local --output ./dist/Money2Time.ipa --non-interactive'
```

Wait for it to complete successfully, then submit:

```
yes | eas submit --platform ios --profile production --path ./dist/Money2Time.ipa --non-interactive
```
