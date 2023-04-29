# hurricash-relayer
Gassless withdrawals for the Hurricash Protocol


# Usage
Send a payload to "https://relayer.hurricash.com" / localhost:3001 if launched locally / (or whatever URL you've deployed it to) with the following structure:
```javascript
{
    "message": string,
    "signedMessage": string,
    "receiver": address, // ethereum/pulse address
    "ethAmount": number,
    "ringIdx": number,
    "c0": string,
    "keyImage": (string, string),
    "s": Array<string>
}
```

# DIY (Deploy-it-yourself)
## Dependencies
```
npm install
node app.js

```

## Running the relayer
1. Clone the project and cd into it's root directory

- create env file with ETH_SK="<INSERT_PKEY>"
 
**Note 1:** Make sure the Pulse address associated with `ETH_SK` has some funds to start with (~0.5 PLS) minimum

**Note 2:** You'll need to purchase a domain name if you want an SSL connection

```
ETH_SK='ethereum-secret-key' // *DO NOT UPLOAD* (If you intend to run on a website and not locally heroku has config vars section)
```
