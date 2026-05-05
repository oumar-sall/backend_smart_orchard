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
                    return branch.contains('main') || branch.contains('feature/deployability') 
                }
            }
            steps {
                echo 'Deploying to production server with PM2...'
                // On utilise 'pm2 reload' ou 'pm2 startOrRestart' pour éviter l'erreur si l'app n'existe pas
                bat 'npx pm2 startOrRestart ecosystem.config.js'
                bat 'npx pm2 save'
                echo 'Deployment successful! Data and Logs are in C:\\pm2\\SmartOrchard'
            }
        }
    }

    post {
        always {
            echo 'Pipeline finished.'
        }
    }
}
