pipeline {
    agent any

    tools {
        nodejs 'node25'
    }

    environment {
        // Dossier public pour PM2 (évite les problèmes de droits Windows)
        PM2_HOME = 'C:\\pm2'
    }

    stages {
        stage('Preparation') {
            steps {
                echo 'Ensuring PM2 home and logs exist...'
                bat 'if not exist C:\\pm2 mkdir C:\\pm2'
                bat 'if not exist C:\\pm2\\logs mkdir C:\\pm2\\logs'
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
                // On essaie de supprimer l'ancien processus, mais on ignore l'erreur s'il n'existe pas
                bat 'npx pm2 delete smart-orchard-api || exit 0'
                
                echo 'Starting application...'
                bat 'set NODE_ENV=production && npx pm2 start ecosystem.config.js'
                
                // Petit temps d'attente (ping est plus compatible que timeout sur Jenkins)
                echo 'Waiting for startup...'
                bat 'ping 127.0.0.1 -n 6 > nul'
                
                echo 'Checking logs...'
                bat 'npx pm2 logs smart-orchard-api --lines 20 --raw --no-colors'
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
