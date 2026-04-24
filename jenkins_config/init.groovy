import jenkins.model.*
import hudson.security.*
import jenkins.security.*
import hudson.tasks.*
import org.jenkinsci.plugins.workflow.job.*
import org.jenkinsci.plugins.docker.workflow.*

// Set Jenkins URL
JenkinsLocationConfiguration.get().setUrl("http://localhost:8080")

// Create admin user
def instance = Jenkins.getInstance()
def hudsonRealm = new HudsonPrivateSecurityRealm(false)
hudsonRealm.createAccount("admin", "admin123")
instance.setSecurityRealm(hudsonRealm)

// Configure authorization
def strategy = new FullControlOnceLoggedInAuthorizationStrategy()
strategy.setAllowAnonymousRead(false)
instance.setAuthorizationStrategy(strategy)

// Install NodeJS plugin configuration
def nodeJSInstallation = new hudson.plugins.nodejs.NodeJSInstallation(
    "node-18", 
    null, 
    [new hudson.plugins.nodejs.tools.NodeJSInstaller("18.19.0", null)]
)
def descriptor = instance.getDescriptor(hudson.plugins.nodejs.NodeJSInstallation)
descriptor.setInstallations(nodeJSInstallation)
descriptor.save()

// Create pipeline job
def jobName = "Todo-App-Deployment"
def job = instance.getItem(jobName)
if (!job) {
    job = instance.createProject(WorkflowJob, jobName)
    def definition = new CpsFlowDefinition("""
pipeline {
    agent any
    stages {
        stage('Test') {
            steps {
                echo 'Testing todo app...'
            }
        }
        stage('Deploy') {
            steps {
                sh 'cd /app && docker-compose up -d --force-recreate todo-app'
            }
        }
    }
}
""", true)
    job.setDefinition(definition)
}

instance.save()
