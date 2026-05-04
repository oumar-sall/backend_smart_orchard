pipeline {
    agent any

    tools {
        // Correspond au nom configuré dans Jenkins > Manage Jenkins > Tools
        nodejs 'node25'
    }

    environment {
        // On force PM2 à trouver un dossier de configuration valide sur Windows
        PM2_HOME = 'C:\\Users\\pc\\.pm2'
    }

    stages {
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
            // On déploie si on est sur une branche connue
            when {
                expression { return env.BRANCH_NAME == 'main' || env.BRANCH_NAME == 'feature/deployability' || env.GIT_BRANCH?.contains('feature/deployability') }
            }
            steps {
                echo 'Deploying to production server with PM2...'
                bat 'set NODE_ENV=production && npx pm2 startOrReload ecosystem.config.js'
            }
        }
    }

    post {
        always {
            echo 'Pipeline finished.'
        }
        failure {
            echo '❌ Pipeline FAILED. Check logs.'
        }
    }
}
