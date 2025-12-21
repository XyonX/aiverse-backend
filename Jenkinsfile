pipeline {
    agent any

    stages {

        stage('Checkout Code') {
            steps {
                git branch: 'main',
                    url: 'https://github.com/XyonX/aiverse-backend.git'
            }
        }

        stage('Build Image') {
            steps {
                sh '''
                docker build -t aiverse-backend .
                '''
            }
        }

        stage('Deploy') {
            steps {
                withCredentials([file(credentialsId: 'AIVERSE_BACKEND_ENV', variable: 'ENV_FILE')]) {
                sh '''
                    set -e
                    echo "ENV_FILE is: $ENV_FILE"
                    ls -l "$ENV_FILE"
                    head -n 5 "$ENV_FILE" || true
                    docker compose --env-file "$ENV_FILE" config >/dev/null
                    docker compose --env-file "$ENV_FILE" down
                    docker compose --env-file "$ENV_FILE" up -d --build
                '''
                }
            }
        }

    }
}