/*
 * © 2021 Thoughtworks, Inc.
 */

import {
  AWSError,
  ChainableTemporaryCredentials,
  Credentials,
  WebIdentityCredentials,
} from 'aws-sdk'
import { IAMCredentialsClient } from '@google-cloud/iam-credentials'
import { GoogleAuth, JWT } from 'google-auth-library'
import { GoogleAuthClient } from '@cloud-carbon-footprint/common'

export default class GCPCredentials extends Credentials {
  constructor(
    private accountId: string,
    private targetRoleName: string,
    private proxyAccountId: string,
    private proxyRoleName: string,
  ) {
    super(undefined)
  }

  async refresh(callback: (err?: AWSError) => void): Promise<void> {
    try {
      console.log(`DEBUG proxyRoleName: ${this.proxyRoleName}`)
      const token = await this.getTokenId()
      console.log(`DEBUG got token: ${token}`)
      const credentials = new ChainableTemporaryCredentials({
        params: {
          RoleArn: `arn:aws:iam::${this.accountId}:role/${this.targetRoleName}`,
          RoleSessionName: this.targetRoleName,
        },
        masterCredentials: new WebIdentityCredentials({
          RoleArn: `arn:aws:iam::${this.proxyAccountId}:role/${this.proxyRoleName}`,
          RoleSessionName: this.proxyRoleName,
          WebIdentityToken: token,
        }),
      })

      await credentials.getPromise()

      this.accessKeyId = credentials.accessKeyId
      this.secretAccessKey = credentials.secretAccessKey
      this.sessionToken = credentials.sessionToken
      this.expireTime = new Date(Date.now() + 1000 * 60 * 60) //Credentials expiration time to 1 hour
      callback()
    } catch (e) {
      console.error(e.message)
      callback(e)
    }
  }

  async getTokenId() {
    const auth = new GoogleAuth({
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    })

    const authClient: GoogleAuthClient = await auth.getClient()
    const iamCredentials = new IAMCredentialsClient({ auth: auth })
    console.log(`DEBUG ${JSON.stringify(<JWT>authClient)}`)
    const projectId = await auth.getProjectId()

    const authClientEmail = (<JWT>authClient).email
      ? (<JWT>authClient).email
      : `${projectId}@appspot.gserviceaccount.com`
    console.log(`DEBUG: projects/-/serviceAccounts/${authClientEmail}`)
    const [res] = await iamCredentials.generateIdToken({
      name: `projects/-/serviceAccounts/${authClientEmail}`,
      audience: `${authClientEmail}`,
      includeEmail: true,
    })
    console.log('DEBUG: after result.')
    return res.token
  }
}
