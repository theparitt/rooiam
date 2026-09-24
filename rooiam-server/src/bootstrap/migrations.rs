use std::borrow::Cow;

use sqlx::{
    migrate::{Migration, Migrator},
    PgPool,
};

// The original production image embedded these files with CRLF endings. The
// repository later normalized them to LF without changing their SQL, so their
// SQLx checksums differ. Keep both known lineages valid; do not rewrite the
// database's migration history or disable SQLx checksum validation.
const CRLF_MIGRATIONS: &[i64] = &[1, 2, 3, 4, 11, 12, 17, 18, 19, 20, 21, 22, 23];

pub async fn run(db: &PgPool) -> Result<(), anyhow::Error> {
    let canonical = sqlx::migrate!("./migrations");

    let has_history: bool =
        sqlx::query_scalar("SELECT to_regclass('_sqlx_migrations') IS NOT NULL")
            .fetch_one(db)
            .await?;
    if !has_history {
        canonical.run(db).await?;
        return Ok(());
    }

    let first_checksum: Option<Vec<u8>> =
        sqlx::query_scalar("SELECT checksum FROM _sqlx_migrations WHERE version = 1 AND success")
            .fetch_optional(db)
            .await?;

    let Some(first_checksum) = first_checksum else {
        canonical.run(db).await?;
        return Ok(());
    };

    let canonical_first = canonical
        .iter()
        .find(|migration| migration.version == 1)
        .ok_or_else(|| anyhow::anyhow!("Bundled migration 1 is missing"))?;
    if first_checksum == canonical_first.checksum.as_ref() {
        canonical.run(db).await?;
        return Ok(());
    }

    let legacy = crlf_compatible_migrator(&canonical);
    let legacy_first = legacy
        .iter()
        .find(|migration| migration.version == 1)
        .ok_or_else(|| anyhow::anyhow!("CRLF-compatible migration 1 is missing"))?;
    if first_checksum == legacy_first.checksum.as_ref() {
        tracing::info!("Using original CRLF migration checksums for the existing database");
        legacy.run(db).await?;
    } else {
        // An unknown checksum is still an error. Let SQLx report the specific
        // migration mismatch instead of accepting an unrecognized history.
        canonical.run(db).await?;
    }
    Ok(())
}

fn crlf_compatible_migrator(canonical: &Migrator) -> Migrator {
    let migrations = canonical
        .iter()
        .map(|migration| {
            if CRLF_MIGRATIONS.contains(&migration.version) {
                Migration::new(
                    migration.version,
                    migration.description.clone(),
                    migration.migration_type,
                    Cow::Owned(migration.sql.replace('\n', "\r\n")),
                    migration.no_tx,
                )
            } else {
                migration.clone()
            }
        })
        .collect();

    Migrator {
        migrations: Cow::Owned(migrations),
        ignore_missing: canonical.ignore_missing,
        locking: canonical.locking,
        no_tx: canonical.no_tx,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_lineage_matches_the_original_production_image() {
        let canonical = sqlx::migrate!("./migrations");
        let legacy = crlf_compatible_migrator(&canonical);
        let recorded = [
            (1, "14c067b60031992bb321128672cb87e7d5d2a62c397090e3956640448d323729be94fab6c32001d4628126891f21c157"),
            (2, "7cd0edf9f234dbd2e5b5fec6b673112ffeac0b70a5fbaf854fd0fb76a289ad8a66afc9a985d5339f1e7574461069b602"),
            (3, "9215fc9d4f5a55ad4d46be039986f1a744920611b389749bc8a914504348a8ff1bdbf926fd864c6100c05f3c5f300b00"),
            (4, "20da0c49fe95b3161df63a18518ca6d32f9c08c8ed447353464e1aae7bf79092addb937fdc82402ced1d9eddc5fcdade"),
            (11, "2ce953d2f8a324c1a5d88dc0510482a89b56289c9f9756f30dbf4bf06f15374413aef43ce705cc80ff12eb7081600dfb"),
            (12, "0300558e76743ed8a5730af0e1bf9dc5fa5f3b18674ae27d3bdbcb26b2ff45dcba61db161c890151403d2b1b446a412f"),
            (17, "ff4cfe6f64134ab338fab2b2c25d223b135e7975476a534521535d181152a8ad34786094944ef761414d4ef8417eb992"),
            (18, "08533313362c4097d20824ca9ffab6d999cc2de23d351b9cef48938c2d2160dc1cbe58c1b3ef3ff1f501732d221c2c21"),
            (19, "d8ce9ad9dca6718726006d37820beffd3d70e472f5838232f5915f5da9ecc6c52e147e844a6eb0978411257c4dafdb7b"),
            (20, "c6116d723e1053ab964693b40e8d96581da85b31d3cc9c69056173efba1272d3e89f7bfd1289965e0a5034443f68309f"),
            (21, "72404095200a1c89f5f36375a8e90789332200cb4450002eb913a21c8910b108e9fb679c95831991bbaf2b8d36bbdbb5"),
            (22, "b2dd7774368afc1af58f08b8ae2d28ad493416a4eec5bb49a5c4b0178bee994fe3384f7db1765a4ea31238ec77332b1f"),
            (23, "b197fc7dba22056c3eb63c926e37bb172efc1cd78e3f99c2e703dd1419cbbc5404cdc5ec9706ce3db3858171b519dcf0"),
        ];
        for (version, checksum) in recorded {
            let migration = legacy
                .iter()
                .find(|migration| migration.version == version)
                .unwrap();
            assert_eq!(
                hex::encode(migration.checksum.as_ref()),
                checksum,
                "migration {version}"
            );
            let current = canonical
                .iter()
                .find(|migration| migration.version == version)
                .unwrap();
            assert_ne!(migration.checksum, current.checksum, "migration {version}");
        }
        for migration in canonical
            .iter()
            .filter(|migration| !CRLF_MIGRATIONS.contains(&migration.version))
        {
            let compatible = legacy
                .iter()
                .find(|item| item.version == migration.version)
                .unwrap();
            assert_eq!(
                compatible.checksum, migration.checksum,
                "migration {}",
                migration.version
            );
        }
    }
}
