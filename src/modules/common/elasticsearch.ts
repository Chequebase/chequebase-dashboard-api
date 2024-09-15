import { Client } from '@elastic/elasticsearch';

const ElasticSearchClient = new Client({
    node: 'https://c1735ed079cf42e796a17b4bd65d1dd3.eu-central-1.aws.cloud.es.io:443',
    auth: {
        apiKey: 'cmhOYzhaRUJyUVNjWW9nMlhmVkE6akpCM0N3dUlSZ09ZcnN2SGJUMmdYQQ=='
    }
  });

export { ElasticSearchClient }