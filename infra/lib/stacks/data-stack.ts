import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  AttributeType,
  Billing,
  ProjectionType,
  StreamViewType,
  TableV2,
} from 'aws-cdk-lib/aws-dynamodb';
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  HttpMethods,
  ObjectOwnership,
  StorageClass,
} from 'aws-cdk-lib/aws-s3';
import { Key } from 'aws-cdk-lib/aws-kms';
import {
  AccountRecovery,
  CfnUserPoolIdentityProvider,
  Mfa,
  NumberAttribute,
  OAuthScope,
  StringAttribute,
  UserPool,
  UserPoolClient,
  UserPoolClientIdentityProvider,
} from 'aws-cdk-lib/aws-cognito';
import {
  AnyPrincipal,
  Effect,
  PolicyStatement,
} from 'aws-cdk-lib/aws-iam';

export type Stage = 'dev' | 'prod';

export interface DataStackProps extends cdk.StackProps {
  /** Logical environment — 'dev' | 'prod'. Used in resource names. */
  readonly stage: Stage;
  /** Removal policy applied to stateful resources (table, buckets, KMS key). */
  readonly removalPolicy: cdk.RemovalPolicy;
  /** Whether to enable optional Cognito MFA. dev=false, prod=true recommended. */
  readonly enableMfa: boolean;
  /** Toggle Apple identity provider scaffold (real client comes from SSM later). */
  readonly appleConfigured?: boolean;
  /** Toggle Google identity provider scaffold (real client comes from SSM later). */
  readonly googleConfigured?: boolean;
}

/**
 * DataStack — DynamoDB single-table + S3 buckets + Cognito user pool.
 *
 * See SPEC.md §6.1 (table + GSIs), §6.3 (S3 buckets), §9.4 + §12 (privacy),
 * §3.1 (Cognito).
 */
export class DataStack extends cdk.Stack {
  public readonly mainTable: TableV2;
  public readonly closetRawBucket: Bucket;
  public readonly closetTunedBucket: Bucket;
  public readonly selfiesBucket: Bucket;
  public readonly ootdBucket: Bucket;
  public readonly selfiesKey: Key;
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const { stage, removalPolicy, enableMfa } = props;
    const isProd = stage === 'prod';

    // ---------------------------------------------------------------------
    // DynamoDB single-table — `mei-main-{stage}` (SPEC.md §6.1)
    // ---------------------------------------------------------------------
    this.mainTable = new TableV2(this, 'MainTable', {
      tableName: `mei-main-${stage}`,
      partitionKey: { name: 'PK', type: AttributeType.STRING },
      sortKey: { name: 'SK', type: AttributeType.STRING },
      billing: Billing.onDemand(),
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      dynamoStream: StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy,
      globalSecondaryIndexes: [
        {
          indexName: 'GSI1',
          partitionKey: { name: 'GSI1PK', type: AttributeType.STRING },
          sortKey: { name: 'GSI1SK', type: AttributeType.STRING },
          projectionType: ProjectionType.ALL,
        },
        {
          indexName: 'GSI2',
          partitionKey: { name: 'GSI2PK', type: AttributeType.STRING },
          sortKey: { name: 'GSI2SK', type: AttributeType.STRING },
          projectionType: ProjectionType.ALL,
        },
      ],
    });

    // ---------------------------------------------------------------------
    // S3 buckets (SPEC.md §6.3)
    // Naming: `mei-{purpose}-{stage}-{accountId}` so we never clash globally.
    // ---------------------------------------------------------------------
    const accountSuffix = cdk.Stack.of(this).account;

    // 1) closet/raw — SSE-S3, lifecycle to Glacier after 30 days, versioned.
    this.closetRawBucket = new Bucket(this, 'ClosetRawBucket', {
      bucketName: `mei-closet-raw-${stage}-${accountSuffix}`,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy,
      autoDeleteObjects: !isProd,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      lifecycleRules: [
        {
          id: 'transition-raw-to-glacier-30d',
          enabled: true,
          transitions: [
            {
              storageClass: StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
      ],
    });

    // 2) closet/tuned — SSE-S3, served via CloudFront in cdn-stack later.
    //    Keep it CloudFront-friendly: block public access + enforce SSL.
    //    The CDN branch will attach the OAC and the matching bucket policy.
    this.closetTunedBucket = new Bucket(this, 'ClosetTunedBucket', {
      bucketName: `mei-closet-tuned-${stage}-${accountSuffix}`,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: false,
      removalPolicy,
      autoDeleteObjects: !isProd,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      cors: [
        {
          allowedMethods: [HttpMethods.GET, HttpMethods.HEAD],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3600,
        },
      ],
    });

    // OAC-friendly stub: TODO(cdn-stack) wire OriginAccessControl + a bucket
    // policy granting the CloudFront distribution read access. Until then
    // this bucket is owner-only and SSL-enforced (handled by `enforceSSL`).

    // 3) selfies — SSE-KMS with a dedicated key. Never via CDN.
    this.selfiesKey = new Key(this, 'SelfiesKmsKey', {
      alias: `alias/mei-selfies-${stage}`,
      description: `KMS key for Mei selfies bucket (${stage}). SPEC.md §12.1`,
      enableKeyRotation: true,
      removalPolicy,
    });

    this.selfiesBucket = new Bucket(this, 'SelfiesBucket', {
      bucketName: `mei-selfies-${stage}-${accountSuffix}`,
      encryption: BucketEncryption.KMS,
      encryptionKey: this.selfiesKey,
      bucketKeyEnabled: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: false,
      removalPolicy,
      autoDeleteObjects: !isProd,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      // SPEC §12.1: keep forever for now; no lifecycle transitions.
    });

    // Hard guard: deny any PutObject that isn't using KMS encryption.
    // (TLS enforcement is already added by `enforceSSL: true` above.)
    this.selfiesBucket.addToResourcePolicy(
      new PolicyStatement({
        sid: 'DenyUnencryptedObjectUploads',
        effect: Effect.DENY,
        principals: [new AnyPrincipal()],
        actions: ['s3:PutObject'],
        resources: [this.selfiesBucket.arnForObjects('*')],
        conditions: {
          StringNotEquals: {
            's3:x-amz-server-side-encryption': 'aws:kms',
          },
        },
      }),
    );

    // 4) ootd — SSE-S3, served via signed URLs by the API.
    this.ootdBucket = new Bucket(this, 'OotdBucket', {
      bucketName: `mei-ootd-${stage}-${accountSuffix}`,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: false,
      removalPolicy,
      autoDeleteObjects: !isProd,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      cors: [
        {
          allowedMethods: [HttpMethods.GET, HttpMethods.HEAD],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3600,
        },
      ],
    });

    // ---------------------------------------------------------------------
    // Cognito user pool (SPEC.md §3.1 + §12)
    // ---------------------------------------------------------------------
    this.userPool = new UserPool(this, 'UserPool', {
      userPoolName: `mei-${stage}`,
      selfSignUpEnabled: true,
      signInAliases: { email: true, username: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      customAttributes: {
        // SPEC §6.2: profile fields. Cognito custom attrs are namespaced
        // `custom:<name>` automatically by the AWS console / SDK.
        birthYear: new NumberAttribute({ min: 1900, max: 2100, mutable: true }),
        countryCode: new StringAttribute({ minLen: 2, maxLen: 2, mutable: true }),
        city: new StringAttribute({ minLen: 1, maxLen: 100, mutable: true }),
      },
      passwordPolicy: {
        minLength: 10,
        requireLowercase: true,
        requireDigits: true,
        requireUppercase: false,
        requireSymbols: false,
      },
      mfa: enableMfa ? Mfa.OPTIONAL : Mfa.OFF,
      mfaSecondFactor: enableMfa
        ? { sms: false, otp: true }
        : undefined,
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      removalPolicy,
      deletionProtection: isProd,
    });

    // Hosted UI domain — leave actual registration off for now.
    // TODO(api-stack): once we have a verified domain or are ready to claim
    // the prefix, uncomment and run `cdk deploy MeiDataStack-{stage}`.
    // this.userPool.addDomain('UserPoolDomain', {
    //   cognitoDomain: { domainPrefix: `mei-${stage}` },
    // });

    // App client for the Expo mobile app — SRP, no client secret, 30-day refresh.
    const supportedIdps: UserPoolClientIdentityProvider[] = [
      UserPoolClientIdentityProvider.COGNITO,
    ];
    if (props.appleConfigured) {
      supportedIdps.push(UserPoolClientIdentityProvider.APPLE);
    }
    if (props.googleConfigured) {
      supportedIdps.push(UserPoolClientIdentityProvider.GOOGLE);
    }

    this.userPoolClient = new UserPoolClient(this, 'MobileClient', {
      userPool: this.userPool,
      userPoolClientName: `mei-mobile-${stage}`,
      generateSecret: false,
      authFlows: {
        userSrp: true,
        // Disable USER_PASSWORD_AUTH on the mobile client; SRP only.
      },
      refreshTokenValidity: cdk.Duration.days(30),
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      preventUserExistenceErrors: true,
      supportedIdentityProviders: supportedIdps,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        // Real callback/logout URLs come from the mobile app; placeholder for synth.
        callbackUrls: ['mei://auth/callback'],
        logoutUrls: ['mei://auth/logout'],
      },
    });

    // Identity provider scaffolds — gated by props. Real client IDs come from
    // SSM later; we keep `client_secret` as an empty placeholder so synth works.
    if (props.appleConfigured) {
      // TODO(auth): pull `clientId`, `teamId`, `keyId`, and the private key from
      // SSM Parameter Store / Secrets Manager once the Apple developer account
      // is ready. Until then this branch is gated off.
      new CfnUserPoolIdentityProvider(this, 'AppleIdp', {
        userPoolId: this.userPool.userPoolId,
        providerName: 'SignInWithApple',
        providerType: 'SignInWithApple',
        providerDetails: {
          client_id: 'PLACEHOLDER_APPLE_CLIENT_ID',
          team_id: 'PLACEHOLDER_APPLE_TEAM_ID',
          key_id: 'PLACEHOLDER_APPLE_KEY_ID',
          private_key: 'PLACEHOLDER_APPLE_PRIVATE_KEY',
          authorize_scopes: 'email name',
        },
        attributeMapping: { email: 'email' },
      });
    }

    if (props.googleConfigured) {
      // TODO(auth): pull from SSM once Google OAuth client is provisioned.
      new CfnUserPoolIdentityProvider(this, 'GoogleIdp', {
        userPoolId: this.userPool.userPoolId,
        providerName: 'Google',
        providerType: 'Google',
        providerDetails: {
          client_id: 'PLACEHOLDER_GOOGLE_CLIENT_ID',
          client_secret: 'PLACEHOLDER_GOOGLE_CLIENT_SECRET',
          authorize_scopes: 'profile email openid',
        },
        attributeMapping: { email: 'email' },
      });
    }

    // ---------------------------------------------------------------------
    // Outputs — consumed by api-stack, async-stack, cdn-stack.
    // ---------------------------------------------------------------------
    new cdk.CfnOutput(this, 'MainTableName', {
      value: this.mainTable.tableName,
      exportName: `mei-${stage}-main-table-name`,
    });
    new cdk.CfnOutput(this, 'MainTableStreamArn', {
      value: this.mainTable.tableStreamArn ?? 'no-stream',
      exportName: `mei-${stage}-main-table-stream-arn`,
    });
    new cdk.CfnOutput(this, 'ClosetRawBucketName', {
      value: this.closetRawBucket.bucketName,
      exportName: `mei-${stage}-closet-raw-bucket`,
    });
    new cdk.CfnOutput(this, 'ClosetTunedBucketName', {
      value: this.closetTunedBucket.bucketName,
      exportName: `mei-${stage}-closet-tuned-bucket`,
    });
    new cdk.CfnOutput(this, 'SelfiesBucketName', {
      value: this.selfiesBucket.bucketName,
      exportName: `mei-${stage}-selfies-bucket`,
    });
    new cdk.CfnOutput(this, 'SelfiesKmsKeyArn', {
      value: this.selfiesKey.keyArn,
      exportName: `mei-${stage}-selfies-kms-arn`,
    });
    new cdk.CfnOutput(this, 'OotdBucketName', {
      value: this.ootdBucket.bucketName,
      exportName: `mei-${stage}-ootd-bucket`,
    });
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      exportName: `mei-${stage}-user-pool-id`,
    });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      exportName: `mei-${stage}-user-pool-client-id`,
    });
  }
}
