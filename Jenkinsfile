pipeline {
    agent any

    environment {
        NODE_ENV = 'production'
    }

    stages {
        stage('Installation') {
            steps {
                echo 'Installing dependencies...'
                sh 'npm install'
            }
        }

        stage('Tests') {
            steps {
                echo 'Running tests...'
                sh 'npm test'
            }
        }

        stage('SonarQube Analysis') {
            steps {
                echo 'Analyzing code quality...'
                // SonarQube call would go here
            }
        }

        stage('Deployment') {
            when {
                branch 'main'
            }
            steps {
                echo 'Deploying to production server...'
                // Zero-downtime reload with PM2
                sh 'pm2 startOrReload ecosystem.config.js'
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
