<?php declare(strict_types=1);

if (!function_exists('compras_eliminar_comprobante')) {

function compras_eliminar_comprobante(PDO $pdo): void {

    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        compra_fail('Método no permitido.',405);
    }

    $body = compra_read_json_body();
    $src  = !empty($body) ? $body : ($_POST ?? []);

    $idUsuario = compra_get_id_usuario_from_request($src);

    $id_movimiento = compra_n_int(
        $src['id_movimiento'] ?? $_GET['id_movimiento'] ?? null
    );

    if(!$id_movimiento){
        compra_fail('Falta id_movimiento.');
    }

    $id_comprobante = compra_n_int($src['id_comprobante'] ?? null);

    try{

        $pdo->beginTransaction();

        if($id_comprobante){

            $st=$pdo->prepare("
                SELECT id_movimiento_comprobante,id_comprobante
                FROM movimientos_comprobantes
                WHERE id_movimiento=:id_movimiento
                AND id_comprobante=:id_comprobante
            ");

            $st->execute([
                ':id_movimiento'=>$id_movimiento,
                ':id_comprobante'=>$id_comprobante
            ]);

        }else{

            $st=$pdo->prepare("
                SELECT id_movimiento_comprobante,id_comprobante
                FROM movimientos_comprobantes
                WHERE id_movimiento=:id_movimiento
            ");

            $st->execute([
                ':id_movimiento'=>$id_movimiento
            ]);
        }

        $rows=$st->fetchAll(PDO::FETCH_ASSOC);

        if(!$rows){
            $pdo->rollBack();
            compra_fail('No se encontró ningún comprobante vinculado.');
        }

        $idsComprobante=array_unique(
            array_column($rows,'id_comprobante')
        );

        foreach($rows as $r){

            $del=$pdo->prepare("
                DELETE FROM movimientos_comprobantes
                WHERE id_movimiento_comprobante=:id
            ");

            $del->execute([
                ':id'=>$r['id_movimiento_comprobante']
            ]);
        }

        $archivosEliminados=[];

        foreach($idsComprobante as $idComp){

            $check=$pdo->prepare("
                SELECT COUNT(*)
                FROM movimientos_comprobantes
                WHERE id_comprobante=:id
            ");

            $check->execute([
                ':id'=>$idComp
            ]);

            if((int)$check->fetchColumn()===0){

                $stArch=$pdo->prepare("
                    SELECT archivo_url
                    FROM comprobantes_archivos
                    WHERE id_comprobante=:id
                    LIMIT 1
                ");

                $stArch->execute([
                    ':id'=>$idComp
                ]);

                $arch=$stArch->fetch(PDO::FETCH_ASSOC);

                $delArch=$pdo->prepare("
                    DELETE FROM comprobantes_archivos
                    WHERE id_comprobante=:id
                ");

                $delArch->execute([
                    ':id'=>$idComp
                ]);

                $archivosEliminados[]=$arch['archivo_url'] ?? '';
            }
        }

        $pdo->commit();

        compra_auditar_seguro(
            $pdo,
            $idUsuario,
            'eliminar_comprobante',
            'compras',
            $id_movimiento,
            [
                'archivos_eliminados'=>$archivosEliminados
            ]
        );

        compra_ok([
            'eliminado'=>true,
            'id_movimiento'=>$id_movimiento
        ]);

    }catch(Throwable $e){

        if($pdo->inTransaction()){
            $pdo->rollBack();
        }

        compra_fail(
            'No se pudo eliminar comprobante: '.$e->getMessage()
        );
    }
}

}