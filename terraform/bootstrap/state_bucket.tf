# Bucket do state remoto dos environments (dev/prod). O state DESTE bootstrap fica local.
resource "google_storage_bucket" "tfstate" {
  name                        = var.state_bucket
  location                    = "US"
  uniform_bucket_level_access = true
  force_destroy               = false

  versioning {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true
  }
}
