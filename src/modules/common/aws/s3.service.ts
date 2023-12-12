import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getEnvOrThrow } from '../utils';
import { Service } from 'typedi';

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

  async getObject(bucket: string, key: string): Promise<Uint8Array> {
    const s3Params = {
      Bucket: bucket,
      Key: key,
    };

    const command = new GetObjectCommand(s3Params);
    const response = await this.s3.send(command);

    return response.Body instanceof Uint8Array ? response.Body : new Uint8Array();
  }
}