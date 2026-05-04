pipeline {
    agent any

    tools {
        nodejs 'node25'
    }

    stages {
        stage('Preparation') {
            steps {
                echo 'Cleaning logs...'
                bat 'if not exist logs mkdir logs'
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
                echo 'Deployment successful!'
            }
        }
    }

    post {
        always {
            echo 'Pipeline finished.'
        }
    }
}
