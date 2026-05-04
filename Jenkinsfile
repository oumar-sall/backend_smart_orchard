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
                expression { return env.BRANCH_NAME == 'main' || env.BRANCH_NAME == 'feature/deployability' || env.GIT_BRANCH?.contains('feature/deployability') }
            }
            steps {
                echo 'Deploying to production server with PM2...'
                bat 'npx pm2 delete smart-orchard-api || exit 0'
                bat 'set NODE_ENV=production && npx pm2 start ecosystem.config.js'
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
