pipeline {
    agent any

    environment {
        MONGODB_URI   = credentials('MONGODB_URI')
        JWT_SECRET    = credentials('jwt_secret_aiverse')
        OPENROUTER_API = credentials('openrouter_api_aiverse')

        DOCKER_IMAGE = "xyonx/aiverse-backend"
    }

    stages {

        stage('Install Dependencies') {
            steps {
                sh 'npm install'
            }
        }

        stage('Run Tests') {
            steps {
                sh 'npm run test'
            }
        }

        stage('Docker Build') {
            steps {
                sh 'docker build -t $DOCKER_IMAGE:latest .'
            }
        }

        stage('Docker Login') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    sh 'echo $DOCKER_PASS | docker login -u $DOCKER_USER --password-stdin'
                }
            }
        }

        stage('Push Image to Docker Hub') {
            steps {
                sh 'docker push $DOCKER_IMAGE:latest'
            }
        }

        stage('Deploy to VM') {
            steps {
                sshagent (['vm-ssh-joyverse']) {
                    sh '''
                    ssh -o StrictHostKeyChecking=no ubuntu@159.89.169.132 "
                        docker pull xyonx/aiverse-backend:latest &&
                        docker stop aiverse-backend || true &&
                        docker rm aiverse-backend || true &&
                        docker run -d --name aiverse-backend -p 3001:3001 \
                        -e MONGODB_URI=$MONGODB_URI \
                        -e JWT_SECRET=$JWT_SECRET \
                        -e OPENROUTER_API=$OPENROUTER_API \
                        xyonx/aiverse-backend:latest
                    "
                    '''
                }
            }
        }
    }
}
