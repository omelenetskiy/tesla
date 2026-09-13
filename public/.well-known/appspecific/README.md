# Tesla virtual key location

Put the Tesla public key file here:

- `public/.well-known/appspecific/com.tesla.3p.public-key.pem`

At runtime it must be reachable at:

- `https://<your-app-domain>/.well-known/appspecific/com.tesla.3p.public-key.pem`

For Netlify, commit this folder and publish the `.pem` file from your deploy source (or upload it in your build pipeline).

