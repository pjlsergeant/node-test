export const mysqlStartText = `2020-03-19T13:11:32.902782Z 0 [Warning] TIMESTAMP with implicit DEFAULT value is deprecated. Please use --explicit_defaults_for_timestamp server option (see documentation for more details).
2020-03-19T13:11:32.907587Z 0 [Warning] Insecure configuration for --secure-file-priv: Location is accessible to all OS users. Consider choosing a different directory.
2020-03-19T13:11:32.908177Z 0 [Note] mysqld (mysqld 5.7.27) starting as process 17185 ...
2020-03-19T13:11:32.910741Z 0 [Warning] Setting lower_case_table_names=2 because file system for /var/folders/jn/_njw_24d2ksf97cd4hqr638c0000gn/T/4c2dbd20e0e6339c/data/ is case insensitive
2020-03-19T13:11:32.912522Z 0 [Note] InnoDB: Mutexes and rw_locks use GCC atomic builtins
2020-03-19T13:11:32.912549Z 0 [Note] InnoDB: Uses event mutexes
2020-03-19T13:11:32.912560Z 0 [Note] InnoDB: GCC builtin __atomic_thread_fence() is used for memory barrier
2020-03-19T13:11:32.912570Z 0 [Note] InnoDB: Compressed tables use zlib 1.2.11
2020-03-19T13:11:32.912930Z 0 [Note] InnoDB: Number of pools: 1
2020-03-19T13:11:32.913161Z 0 [Note] InnoDB: Using CPU crc32 instructions
2020-03-19T13:11:32.914921Z 0 [Note] InnoDB: Initializing buffer pool, total size = 128M, instances = 1, chunk size = 128M
2020-03-19T13:11:32.928725Z 0 [Note] InnoDB: Completed initialization of buffer pool
2020-03-19T13:11:32.944961Z 0 [Note] InnoDB: Highest supported file format is Barracuda.
2020-03-19T13:11:32.952865Z 0 [Note] InnoDB: Creating shared tablespace for temporary tables
2020-03-19T13:11:32.953089Z 0 [Note] InnoDB: Setting file './ibtmp1' size to 12 MB. Physically writing the file full; Please wait ...
2020-03-19T13:11:32.964704Z 0 [Note] InnoDB: File './ibtmp1' size is now 12 MB.
2020-03-19T13:11:32.965541Z 0 [Note] InnoDB: 96 redo rollback segment(s) found. 96 redo rollback segment(s) are active.
2020-03-19T13:11:32.965560Z 0 [Note] InnoDB: 32 non-redo rollback segment(s) are active.
2020-03-19T13:11:32.966600Z 0 [Note] InnoDB: Waiting for purge to start
2020-03-19T13:11:33.019006Z 0 [Note] InnoDB: 5.7.27 started; log sequence number 2625438
2020-03-19T13:11:33.019258Z 0 [Note] InnoDB: Loading buffer pool(s) from /private/var/folders/jn/_njw_24d2ksf97cd4hqr638c0000gn/T/4c2dbd20e0e6339c/data/ib_buffer_pool
2020-03-19T13:11:33.019333Z 0 [Note] Plugin 'FEDERATED' is disabled.
2020-03-19T13:11:33.021503Z 0 [Note] InnoDB: Buffer pool(s) load completed at 200319 14:11:33
2020-03-19T13:11:33.029947Z 0 [Note] Found ca.pem, server-cert.pem and server-key.pem in data directory. Trying to enable SSL support using them.
2020-03-19T13:11:33.030017Z 0 [Note] Skipping generation of SSL certificates as certificate files are present in data directory.
2020-03-19T13:11:33.031133Z 0 [Warning] CA certificate ca.pem is self signed.
2020-03-19T13:11:33.031243Z 0 [Note] Skipping generation of RSA key pair as key files are present in data directory.
2020-03-19T13:11:33.031558Z 0 [Note] Server hostname (bind-address): '127.0.0.1'; port: 56923
2020-03-19T13:11:33.031937Z 0 [Note]   - '127.0.0.1' resolves to '127.0.0.1';
2020-03-19T13:11:33.032102Z 0 [Note] Server socket created on IP: '127.0.0.1'.
2020-03-19T13:11:33.032708Z 0 [Warning] Insecure configuration for --pid-file: Location '/var/folders/jn/_njw_24d2ksf97cd4hqr638c0000gn/T/4c2dbd20e0e6339c' in the path is accessible to all OS users. Consider choosing a different directory.
2020-03-19T13:11:33.050911Z 0 [Note] Event Scheduler: Loaded 0 events
2020-03-19T13:11:33.051053Z 0 [Note] mysqld: ready for connections.
Version: '5.7.27'  socket: '/var/folders/jn/_njw_24d2ksf97cd4hqr638c0000gn/T/4c2dbd20e0e6339c/mysql.sock'  port: 56923  Homebrew
`
