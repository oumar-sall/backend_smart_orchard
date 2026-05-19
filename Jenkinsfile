pipeline {
    agent any

    tools {
        nodejs 'node25'
    }

    stages {
        stage('Preparation') {
            steps {
                echo 'Ensuring consistent production directory structure...'
                bat 'if not exist C:\\pm2\\SmartOrchard\\data mkdir C:\\pm2\\SmartOrchard\\data'
                bat 'if not exist C:\\pm2\\SmartOrchard\\logs mkdir C:\\pm2\\SmartOrchard\\logs'
            }
        }

        stage('Installation') {
            steps {
                echo 'Installing dependencies...'
                bat 'npm install'
            }
        }

        stage('Tests') {
            steps {
                echo 'Running tests...'
                bat 'npx jest --forceExit'
            }
        }

        stage('Deployment') {
            when {
                expression { 
                    def branch = env.BRANCH_NAME ?: env.GIT_BRANCH ?: env.BRANCH ?: ""
                    return branch.contains('main')
                }
            }
            steps {
                echo 'Deploying to production server with Docker Compose...'
                // Stoppe l'ancienne version, reconstruit l'image et redémarre la BDD et l'API
                bat 'docker-compose down'
                bat 'docker-compose up -d --build'
                echo 'Deployment successful! Application is running via Docker on port 3000.'
            }
        }
    }

    post {
        always {
            echo 'Pipeline finished.'
        }
    }
}
