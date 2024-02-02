import { S3Client, GetObjectCommand, PutObjectCommand, ObjectCannedACL, CompleteMultipartUploadCommandOutput } from '@aws-sdk/client-s3';
import { getEnvOrThrow } from '../utils';
import { Service } from 'typedi';
import { Upload } from '@aws-sdk/lib-storage';
import { InternalServerError } from 'routing-controllers';
import Logger from '../utils/logger';

const logger = new Logger('s3-service')
@Service()
export class S3Service {
  s3: S3Client;

  constructor () {
    this.s3 = new S3Client({ region: getEnvOrThrow('AWS_REGION') });
  }

  async putObject(bucket: string, key: string, data: Buffer) {
    const s3Params = {
      Bucket: bucket,
      Key: key,
      Body: data
    };

    const command = new PutObjectCommand(s3Params);
    return await this.s3.send(command);
  }

  async getObject(bucket: string, key: string): Promise<Uint8Array | undefined> {
    const s3Params = {
      Bucket: bucket,
      Key: key,
    };

    const command = new GetObjectCommand(s3Params);
    const response = await this.s3.send(command);

    return response.Body?.transformToByteArray()
  }

  async uploadObject(bucket: string, key: string, data: Buffer) {
    let ACL: ObjectCannedACL = "public-read";
    const params = {
      Key: key,
      Body: data,
      ACL,
      Bucket: bucket,
    };
  
    try {
      const result: CompleteMultipartUploadCommandOutput = await new Upload(
        { client: this.s3, params }
      ).done();
  
      if (!result.Location)
        throw new InternalServerError("Unable to resolve s3 location");
  
      return result.Location
    } catch (err: any) {
      logger.error('error uploading file', { message: err.message })
      throw err
    }
  }
}