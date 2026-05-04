pipeline {
    agent any

    environment {
        NODE_ENV = 'production'
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
                bat 'npm test'
            }
        }

        stage('Deployment') {
            // On déploie si on est sur la branche de test OU sur main
            when {
                anyOf {
                    branch 'main'
                    branch 'feature/deployability'
                }
            }
            steps {
                echo 'Deploying to production server with PM2...'
                // Utilisation de bat pour Windows et appel explicite du fichier de config
                bat 'pm2 startOrReload ecosystem.config.js'
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
